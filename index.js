const Promise = require("bluebird");
const shortid = require("shortid");
const cronParser = require("cron-parser");
const Redis = require("redis");

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

module.exports = (redisSetter, redisGetter) => {
  this.natif = redisSetter;

  const scheduleEvent = (expirationType, expirationValue) => async (
    key,
    value,
    timeout
  ) => {
    const currentDate = new Date().getTime();
    const guuid = shortid.generate().replace(/_/g, "-");
    await Promise.all([
      redisSetter.setAsync(`${key}_${guuid}`, "", "PX", timeout),
      redisSetter.setAsync(`${key}_${guuid}_guuid`, guuid),
      redisSetter.setAsync(`${key}_${guuid}_value`, value),
      redisSetter.setAsync(`${key}_${guuid}_expiration_type`, expirationType),
      redisSetter.setAsync(`${key}_${guuid}_expiration_value`, timeout),
      redisSetter.setAsync(
        `${key}_${guuid}_expiration_expression`,
        expirationValue
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
      expiration_expression: expirationValue,
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
    cron: expression => {
      const date = cronParser
        .parseExpression(expression)
        .next()
        .toString();
      const currentDate = new Date().getTime();
      const ndate = date ? new Date(date).getTime() : currentDate;
      const calculTimeout = ndate - currentDate <= 0 ? 1 : ndate - currentDate;
      return scheduleEvent("CRON", expression)(key, value, calculTimeout);
    }
  });

  const getAllGuuidByKey = async key =>
    Object.values(
      await (await redisSetter
        .multi()
        .keys(`${key}_*`)
        .execAsync())
        .shift()
        .reduce((accumulator, currentValue) => {
          const cObject = accumulator;
          const guuid = currentValue.substring(key.length + 1).split("_")[0];
          if (!guuid) return accumulator;
          cObject[guuid] = guuid;
          return cObject;
        }, {})
    );

  const getAllKeysByGuuid = async guuid =>
    Object.values(
      await (await redisSetter
        .multi()
        .keys(`*_${guuid}_*`)
        .execAsync())
        .shift()
        .reduce(async (accumulator, currentValue) => {
          const cObject = accumulator;
          const key = currentValue.substring(
            0,
            currentValue.indexOf(guuid) - 1
          );
          if (!key) return accumulator;
          cObject[key] = key;
          return cObject;
        }, {})
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
      expiration_expression: ["TIMEOUT", "NOW"].includes(redisExpirationType)
        ? parseInt(redisExpirationExpression, 10)
        : redisExpirationExpression,
      created_at: parseInt(redisCreatedAt, 10),
      expiration_at: parseInt(redisExpirationAt, 10)
    };
  };

  this.getByGuuid = async guuid =>
    (await Promise.map(await getAllKeysByGuuid(guuid), async key => {
      const redisValue = await redisSetter.getAsync(`${key}_${guuid}_value`);
      if (!redisValue) return null;
      return this.getByKeyGuuid(key, guuid);
    })).shift();

  this.get = async (key, value) =>
    (await Promise.map(await getAllGuuidByKey(key), async guuid => {
      const redisValue = await redisSetter.getAsync(`${key}_${guuid}_value`);
      if (!redisValue || (value && value !== redisValue)) return null;
      return this.getByKeyGuuid(key, guuid);
    })).filter(elem => elem !== null);

  this.delByKeyGuuid = (key, guuid) =>
    Promise.all([
      redisSetter.del(`${key}_${guuid}`),
      redisSetter.del(`${key}_${guuid}_value`),
      redisSetter.del(`${key}_${guuid}_guuid`),
      redisSetter.del(`${key}_${guuid}_expiration_type`),
      redisSetter.del(`${key}_${guuid}_expiration_value`),
      redisSetter.del(`${key}_${guuid}_expiration_expression`),
      redisSetter.del(`${key}_${guuid}_create_at`),
      redisSetter.del(`${key}_${guuid}_expiration_at`)
    ]);

  this.delByGuuid = async guuid =>
    Promise.map(await getAllKeysByGuuid(guuid), async key => {
      const redisValue = await redisSetter.getAsync(`${key}_${guuid}_value`);
      if (!redisValue) return null;
      return this.delByKeyGuuid(key, guuid);
    });

  this.del = async (key, value) =>
    Promise.map(await getAllGuuidByKey(key), async guuid => {
      const redisValue = await redisSetter.getAsync(`${key}_${guuid}_value`);
      if (!redisValue || (value && value !== redisValue)) return null;
      return this.delByKeyGuuid(key, guuid);
    });

  this.updateByKeyGuuid = (key, guuid) => toUpdate =>
    redisSetter.set(`${key}_${guuid}_value`, toUpdate);

  this.updateByGuuid = guuid => async toUpdate =>
    Promise.map(await getAllKeysByGuuid(guuid), async key => {
      const redisValue = await redisSetter.getAsync(`${key}_${guuid}_value`);
      if (!redisValue) return null;
      return this.updateByKeyGuuid(key, guuid)(toUpdate);
    });

  this.update = (key, value) => async toUpdate =>
    Promise.map(await getAllGuuidByKey(key), async guuid => {
      const redisValue = await redisSetter.getAsync(`${key}_${guuid}_value`);
      if (!redisValue || (value && value !== redisValue)) return null;
      return this.updateByKeyGuuid(key, guuid)(toUpdate);
    });

  const executeEvents = (key, value, guuid) => (
    expirationType,
    expirationExpression
  ) => async list => {
    let isInterval = expirationType === "CRON";
    if (value && !Number.isNaN(value)) {
      await Promise.map(list, cb =>
        cb(value, key, () => {
          isInterval = false;
        })
      );
      if (isInterval) {
        await this.set(key, value).cron(expirationExpression);
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
          elements.expiration_expression
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
      await executeEvents(key, value, guuid)(
        expirationType,
        expirationExpression
      )(listEvents[key]);
    }
  });
  redisSubscriber.psubscribe("__keyevent@0__:expired");

  return this;
};
