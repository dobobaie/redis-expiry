const Promise = require("bluebird");
const shortid = require("shortid");
const cronParser = require("cron-parser");
const Redis = require("redis");

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

const jsonParse = str => {
  try {
    return str ? JSON.parse(str) : undefined;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(`Redis-expiry: ${e.stack} during JSON.parse(${str})`);
  }
  return undefined;
};

module.exports = (redisSetter, redisGetter) => {
  this.natif = redisSetter;

  const scheduleEvent = (
    expirationType,
    expirationExpression,
    expirationExtra
  ) => async (key, value, timeout) => {
    const currentDate = new Date().getTime();
    const guuid = shortid.generate().replace(/_/g, "-");
    await Promise.all([
      redisSetter.setAsync(`${key}_${guuid}`, "", "PX", timeout),
      redisSetter.setAsync(`${key}_${guuid}_guuid`, guuid),
      redisSetter.setAsync(`${key}_${guuid}_value`, value),
      redisSetter.setAsync(`${key}_${guuid}_expiration_type`, expirationType),
      redisSetter.setAsync(`${key}_${guuid}_expiration_value`, timeout),
      redisSetter.setAsync(
        `${key}_${guuid}_expiration_extra`,
        JSON.stringify(expirationExtra) || ""
      ),
      redisSetter.setAsync(
        `${key}_${guuid}_expiration_expression`,
        expirationExpression
      ),
      redisSetter.setAsync(`${key}_${guuid}_create_at`, currentDate),
      redisSetter.setAsync(
        `${key}_${guuid}_expiration_at`,
        currentDate + timeout * 100
      )
    ]);
    return {
      guuid,
      value,
      expiration_type: expirationType,
      expiration_value: timeout,
      expiration_extra: expirationExtra || undefined,
      expiration_expression: expirationExpression,
      created_at: currentDate,
      expiration_at: currentDate + timeout * 100
    };
  };

  this.set = (key, value) => ({
    timeout: time => scheduleEvent("TIMEOUT", time)(key, value, time || 1),
    now: () => scheduleEvent("NOW", 1)(key, value, 1),
    at: date => {
      const currentDate = new Date().getTime();
      const ndate = date ? new Date(date).getTime() : currentDate;
      const calculTimeout = ndate - currentDate <= 0 ? 1 : ndate - currentDate;
      return scheduleEvent("AT", date)(key, value, calculTimeout);
    },
    cron: (expression, options) => {
      const date = cronParser
        .parseExpression(expression, options || undefined)
        .next()
        .toString();
      const currentDate = new Date().getTime();
      const ndate = date ? new Date(date).getTime() : currentDate;
      const calculTimeout = ndate - currentDate <= 0 ? 1 : ndate - currentDate;
      return scheduleEvent("CRON", expression, options)(
        key,
        value,
        calculTimeout
      );
    }
  });

  const getAllGuuidByKey = async (key, value) =>
    Object.values(
      await Promise.reduce(
        (await redisSetter
          .multi()
          .keys(`${key}_*`)
          .execAsync()).shift(),
        async (accumulator, currentValue) => {
          const cObject = accumulator;
          const guuid = currentValue.substring(key.length + 1).split("_")[0];
          if (!guuid || cObject[guuid]) return accumulator;
          const redisValue = await redisSetter.getAsync(
            `${key}_${guuid}_value`
          );
          if (!redisValue || (value && value !== redisValue)) {
            return accumulator;
          }
          cObject[guuid] = guuid;
          return cObject;
        },
        {}
      )
    );

  const getAllKeysByGuuid = async guuid =>
    Object.values(
      await Promise.reduce(
        (await redisSetter
          .multi()
          .keys(`*_${guuid}_*`)
          .execAsync()).shift(),
        async (accumulator, currentValue) => {
          const cObject = accumulator;
          const key = currentValue.substring(
            0,
            currentValue.indexOf(guuid) - 1
          );
          if (!key || cObject[key]) return accumulator;
          const redisValue = await redisSetter.getAsync(
            `${key}_${guuid}_value`
          );
          if (!redisValue) return accumulator;
          cObject[key] = key;
          return cObject;
        },
        {}
      )
    );

  this.getByKeyGuuid = async (key, guuid) => {
    const redisValue = await redisSetter.getAsync(`${key}_${guuid}_value`);
    const redisGuuid = await redisSetter.getAsync(`${key}_${guuid}_guuid`);
    const redisExpirationType = await redisSetter.getAsync(
      `${key}_${guuid}_expiration_type`
    );
    const redisExpirationValue = await redisSetter.getAsync(
      `${key}_${guuid}_expiration_value`
    );
    const redisExpirationExtra = await redisSetter.getAsync(
      `${key}_${guuid}_expiration_extra`
    );
    const redisExpirationExpression = await redisSetter.getAsync(
      `${key}_${guuid}_expiration_expression`
    );
    const redisCreatedAt = await redisSetter.getAsync(
      `${key}_${guuid}_create_at`
    );
    const redisExpirationAt = await redisSetter.getAsync(
      `${key}_${guuid}_expiration_at`
    );
    return {
      guuid: redisGuuid,
      value: redisValue,
      expiration_type: redisExpirationType,
      expiration_value: parseInt(redisExpirationValue, 10),
      expiration_extra: ["CRON"].includes(redisExpirationType)
        ? jsonParse(redisExpirationExtra)
        : redisExpirationExtra || undefined,
      expiration_expression: ["TIMEOUT", "NOW"].includes(redisExpirationType)
        ? parseInt(redisExpirationExpression, 10)
        : redisExpirationExpression,
      created_at: parseInt(redisCreatedAt, 10),
      expiration_at: parseInt(redisExpirationAt, 10)
    };
  };

  this.getByGuuid = async guuid =>
    (await Promise.map(await getAllKeysByGuuid(guuid), async key =>
      this.getByKeyGuuid(key, guuid)
    )).shift();

  this.get = async (key, value) =>
    (await Promise.map(await getAllGuuidByKey(key, value), async guuid =>
      this.getByKeyGuuid(key, guuid)
    )).filter(elem => elem !== null);

  this.delByKeyGuuid = (key, guuid) =>
    Promise.all([
      redisSetter.del(`${key}_${guuid}`),
      redisSetter.del(`${key}_${guuid}_value`),
      redisSetter.del(`${key}_${guuid}_guuid`),
      redisSetter.del(`${key}_${guuid}_expiration_type`),
      redisSetter.del(`${key}_${guuid}_expiration_value`),
      redisSetter.del(`${key}_${guuid}_expiration_extra`),
      redisSetter.del(`${key}_${guuid}_expiration_expression`),
      redisSetter.del(`${key}_${guuid}_create_at`),
      redisSetter.del(`${key}_${guuid}_expiration_at`)
    ]);

  this.delByGuuid = async guuid =>
    Promise.map(await getAllKeysByGuuid(guuid), async key =>
      this.delByKeyGuuid(key, guuid)
    );

  this.del = async (key, value) =>
    Promise.map(await getAllGuuidByKey(key, value), async guuid =>
      this.delByKeyGuuid(key, guuid)
    );

  this.updateByKeyGuuid = (key, guuid) => toUpdate =>
    redisSetter.set(`${key}_${guuid}_value`, toUpdate);

  this.updateByGuuid = guuid => async toUpdate =>
    Promise.map(await getAllKeysByGuuid(guuid), async key =>
      this.updateByKeyGuuid(key, guuid)(toUpdate)
    );

  this.update = (key, value) => async toUpdate =>
    Promise.map(await getAllGuuidByKey(key, value), async guuid =>
      this.updateByKeyGuuid(key, guuid)(toUpdate)
    );

  const getAvailableScheduler = (callback, moreFunctions) =>
    Object.keys(Object.assign(moreFunctions || {}, this.set())).reduce(
      (accumulator, currentValue) =>
        Object.assign(accumulator, {
          [currentValue]: (expression, options) =>
            callback(currentValue, expression, options)
        }),
      {}
    );

  const andUpdateValue = (asyncKeys, asyncGuuids) => toUpdate =>
    getAvailableScheduler(async (type, expression, options) => {
      const keys = await asyncKeys;
      const guuids = await asyncGuuids;
      return (elements => (Array.isArray(keys) ? elements : elements.shift()))(
        await Promise.map(Array.isArray(keys) ? keys : [keys], async key =>
          (elements => (Array.isArray(guuids) ? elements : elements.shift()))(
            await Promise.map(
              Array.isArray(guuids) ? guuids : [guuids],
              async guuid => {
                await this.delByKeyGuuid(key, guuid);
                return this.set(key, toUpdate)[type](expression, options);
              }
            )
          )
        )
      );
    });

  this.rescheduleByKeyGuuid = (key, guuid) =>
    getAvailableScheduler(
      (type, expression, options) =>
        type === "andUpdateValue"
          ? andUpdateValue(key, guuid)(expression)
          : (async () => {
              const value = await redisSetter.getAsync(`${key}_${guuid}_value`);
              await this.delByKeyGuuid(key, guuid);
              return this.set(key, value)[type](expression, options);
            })(),
      { andUpdateValue }
    );

  this.rescheduleByGuuid = guuid =>
    getAvailableScheduler(
      (type, expression, options) =>
        type === "andUpdateValue"
          ? andUpdateValue(getAllKeysByGuuid(guuid), guuid)(expression)
          : (async () =>
              Promise.map(await getAllKeysByGuuid(guuid), async key =>
                this.rescheduleByKeyGuuid(key, guuid)[type](expression, options)
              ))(),
      { andUpdateValue }
    );

  this.reschedule = (key, value) =>
    getAvailableScheduler(
      (type, expression, options) =>
        type === "andUpdateValue"
          ? andUpdateValue(key, getAllGuuidByKey(key, value))(expression)
          : (async () =>
              Promise.map(await getAllGuuidByKey(key, value), async guuid =>
                this.rescheduleByKeyGuuid(key, guuid)[type](expression, options)
              ))(),
      { andUpdateValue }
    );

  const executeEvents = (key, value, guuid) => (
    expirationType,
    expirationExpression,
    expirationExtra
  ) => async list => {
    let isInterval = expirationType === "CRON";
    if (value && !Number.isNaN(value)) {
      await Promise.map(list, cb =>
        cb(value, key, () => {
          isInterval = false;
        })
      );
      if (isInterval) {
        const extra = jsonParse(expirationExtra);
        await this.set(key, value).cron(expirationExpression, extra);
      }
    }
    await this.delByKeyGuuid(key, guuid);
  };

  const verifyKeyExpired = async (key, cb) => {
    const list = await this.get(key);
    const currentDate = new Date();
    await Promise.map(list, async elements => {
      if (parseInt(elements.expiration_at, 10) <= currentDate.getTime()) {
        await executeEvents(key, elements.value, elements.guuid)(
          elements.expiration_type,
          elements.expiration_expression,
          elements.expiration_extra
        )([cb]);
      }
    });
  };

  const listEvents = {};
  this.on = async (key, cb) => {
    listEvents[key] = listEvents[key] || [];
    listEvents[key].push(cb);
    await verifyKeyExpired(key, cb);
  };

  if (typeof redisGetter === "string") {
    // eslint-disable-next-line no-console
    console.log(
      `Redis-expiry: use redisGetter as string is deprecated. It will be remove in the next version.`
    );
  }

  const redisSubscriber =
    typeof redisGetter === "string"
      ? Redis.createClient(redisGetter)
      : redisGetter;
  redisSubscriber.config("set", "notify-keyspace-events", "Ex");
  redisSubscriber.on("pmessage", async (pattern, channel, expiredKey) => {
    const keys = expiredKey.split("_");
    const guuid = keys.pop();
    const key = keys.join("_");

    if (listEvents[key]) {
      const value = await redisSetter.getAsync(`${key}_${guuid}_value`);
      const expirationType = await redisSetter.getAsync(
        `${key}_${guuid}_expiration_type`
      );
      const expirationExpression = await redisSetter.getAsync(
        `${key}_${guuid}_expiration_expression`
      );
      const expirationExtra = await redisSetter.getAsync(
        `${key}_${guuid}_expiration_extra`
      );
      await executeEvents(key, value, guuid)(
        expirationType,
        expirationExpression,
        expirationExtra
      )(listEvents[key]);
    }
  });
  redisSubscriber.psubscribe("__keyevent@0__:expired");

  return this;
};
