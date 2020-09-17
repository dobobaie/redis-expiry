const Promise = require("bluebird");
const shortid = require("shortid");
const cronParser = require("cron-parser");
const RegexParser = require("regex-parser");

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
  this.redisSetter = Promise.promisifyAll(redisSetter);
  this.redisGetter = Promise.promisifyAll(redisGetter);

  const scheduleEvent = (
    expirationType,
    expirationExpression,
    expirationExtra
  ) => async (key, value, timeout) => {
    const currentDate = new Date().getTime();
    const guuid = shortid.generate().replace(/_/g, "-");
    await Promise.all([
      timeout
        ? this.redisSetter.setAsync(`${key}_${guuid}`, "", "PX", timeout)
        : this.redisSetter.setAsync(`${key}_${guuid}`, ""),
      this.redisSetter.setAsync(`${key}_${guuid}_value`, value),
      this.redisSetter.setAsync(`${key}_${guuid}_guuid`, guuid),
      this.redisSetter.setAsync(`${key}_${guuid}_key`, key),
      this.redisSetter.setAsync(
        `${key}_${guuid}_expiration_type`,
        expirationType
      ),
      this.redisSetter.setAsync(
        `${key}_${guuid}_expiration_value`,
        timeout || ""
      ),
      this.redisSetter.setAsync(
        `${key}_${guuid}_expiration_extra`,
        JSON.stringify(expirationExtra) || ""
      ),
      this.redisSetter.setAsync(
        `${key}_${guuid}_expiration_expression`,
        expirationExpression || ""
      ),
      this.redisSetter.setAsync(`${key}_${guuid}_created_at`, currentDate),
      this.redisSetter.setAsync(
        `${key}_${guuid}_expiration_at`,
        timeout ? currentDate + timeout * 100 : ""
      )
    ]);

    return {
      guuid,
      value,
      key,
      expiration_type: expirationType,
      expiration_value: timeout || undefined,
      expiration_extra: expirationExtra || undefined,
      expiration_expression: expirationExpression || undefined,
      created_at: currentDate,
      expiration_at: timeout ? currentDate + timeout * 100 : undefined
    };
  };

  this.set = (key, value) => ({
    infinit: () => scheduleEvent("INFINIT")(key, value),
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

  const getAllByRegexp = async (regexp, value) =>
    Promise.reduce(
      (await new Promise((resolve, reject) =>
        this.redisSetter
          .multi()
          .keys(`*_guuid`)
          .exec((err, result) => (err ? reject(err) : resolve(result)))
      )).shift(),
      async (accumulator, currentValue) => {
        const cObject = accumulator;
        const guuid = currentValue
          .substring(0, currentValue.length - "_guuid".length)
          .split("_")
          .pop();
        const key = currentValue.substring(
          0,
          currentValue.length - "_guuid".length - guuid.length - 1
        );
        if (!guuid || cObject[guuid]) return accumulator;
        const redisValue = await this.redisSetter.getAsync(
          `${key}_${guuid}_value`
        );
        if (
          (typeof regexp === "string" &&
            !RegExp(RegexParser(regexp)).test(key)) ||
          (typeof regexp !== "string" && !regexp.test(key)) ||
          (value && value !== redisValue)
        ) {
          return accumulator;
        }
        cObject[guuid] = key;
        return cObject;
      },
      {}
    );

  const getAllGuuidByKey = async (key, value) =>
    Object.keys(
      await Promise.reduce(
        (await new Promise((resolve, reject) =>
          this.redisSetter
            .multi()
            .keys(`${key}_*_guuid`)
            .exec((err, result) => (err ? reject(err) : resolve(result)))
        )).shift(),
        async (accumulator, currentValue) => {
          const cObject = accumulator;
          const guuid = currentValue
            .substring(key.length + 1)
            .split("_")
            .shift();
          if (!guuid || cObject[guuid]) return accumulator;
          const redisValue = await this.redisSetter.getAsync(
            `${key}_${guuid}_value`
          );
          if (value && value !== redisValue) {
            return accumulator;
          }
          cObject[guuid] = key;
          return cObject;
        },
        {}
      )
    );

  const getAllKeysByGuuid = async guuid =>
    Object.values(
      await Promise.reduce(
        (await new Promise((resolve, reject) =>
          this.redisSetter
            .multi()
            .keys(`*_${guuid}_guuid`)
            .exec((err, result) => (err ? reject(err) : resolve(result)))
        )).shift(),
        async (accumulator, currentValue) => {
          const cObject = accumulator;
          const key = currentValue.substring(
            0,
            currentValue.indexOf(guuid) - 1
          );
          if (!key || cObject[key]) return accumulator;
          cObject[guuid] = key;
          return cObject;
        },
        {}
      )
    );

  this.getByKeyGuuid = async (key, guuid) => {
    const redisValue = await this.redisSetter.getAsync(`${key}_${guuid}_value`);
    const redisGuuid = await this.redisSetter.getAsync(`${key}_${guuid}_guuid`);
    const redisKey = await this.redisSetter.getAsync(`${key}_${guuid}_key`);
    const redisExpirationType = await this.redisSetter.getAsync(
      `${key}_${guuid}_expiration_type`
    );
    const redisExpirationValue = await this.redisSetter.getAsync(
      `${key}_${guuid}_expiration_value`
    );
    const redisExpirationExtra = await this.redisSetter.getAsync(
      `${key}_${guuid}_expiration_extra`
    );
    const redisExpirationExpression = await this.redisSetter.getAsync(
      `${key}_${guuid}_expiration_expression`
    );
    const redisCreatedAt = await this.redisSetter.getAsync(
      `${key}_${guuid}_created_at`
    );
    const redisExpirationAt = await this.redisSetter.getAsync(
      `${key}_${guuid}_expiration_at`
    );

    return {
      guuid: redisGuuid,
      value: redisValue,
      key: redisKey,
      expiration_type: redisExpirationType,
      expiration_value: redisExpirationValue
        ? parseInt(redisExpirationValue, 10)
        : undefined,
      expiration_extra: ["CRON"].includes(redisExpirationType)
        ? jsonParse(redisExpirationExtra)
        : redisExpirationExtra || undefined,
      expiration_expression: ["TIMEOUT", "NOW"].includes(redisExpirationType)
        ? parseInt(redisExpirationExpression, 10)
        : redisExpirationExpression || undefined,
      created_at: parseInt(redisCreatedAt, 10),
      expiration_at: redisExpirationAt
        ? parseInt(redisExpirationAt, 10)
        : undefined
    };
  };

  this.getByGuuid = async guuid =>
    (await Promise.map(await getAllKeysByGuuid(guuid), async key =>
      this.getByKeyGuuid(key, guuid)
    )).shift();

  const getByRegexp = async (regexp, value) => {
    const result = await getAllByRegexp(regexp, value);
    return (await Promise.map(Object.keys(result), async guuid =>
      this.getByKeyGuuid(result[guuid], guuid)
    )).filter(elem => elem !== null);
  };

  this.get = async (key, value) =>
    typeof key !== "string"
      ? getByRegexp(key, value)
      : (await Promise.map(await getAllGuuidByKey(key, value), async guuid =>
          this.getByKeyGuuid(key, guuid)
        )).filter(elem => elem !== null);

  this.delByKeyGuuid = (key, guuid) =>
    Promise.all([
      this.redisSetter.del(`${key}_${guuid}`),
      this.redisSetter.del(`${key}_${guuid}_value`),
      this.redisSetter.del(`${key}_${guuid}_guuid`),
      this.redisSetter.del(`${key}_${guuid}_key`),
      this.redisSetter.del(`${key}_${guuid}_expiration_type`),
      this.redisSetter.del(`${key}_${guuid}_expiration_value`),
      this.redisSetter.del(`${key}_${guuid}_expiration_extra`),
      this.redisSetter.del(`${key}_${guuid}_expiration_expression`),
      this.redisSetter.del(`${key}_${guuid}_created_at`),
      this.redisSetter.del(`${key}_${guuid}_expiration_at`)
    ]);

  this.delByGuuid = async guuid =>
    Promise.map(await getAllKeysByGuuid(guuid), async key =>
      this.delByKeyGuuid(key, guuid)
    );

  const delByRegexp = async (regexp, value) => {
    const result = await getAllByRegexp(regexp, value);
    return Promise.map(Object.keys(result), async guuid =>
      this.delByKeyGuuid(result[guuid], guuid)
    );
  };

  this.del = async (key, value) =>
    typeof key !== "string"
      ? delByRegexp(key, value)
      : Promise.map(await getAllGuuidByKey(key, value), async guuid =>
          this.delByKeyGuuid(key, guuid)
        );

  this.updateByKeyGuuid = (key, guuid) => toUpdate =>
    this.redisSetter.set(`${key}_${guuid}_value`, toUpdate);

  this.updateByGuuid = guuid => async toUpdate =>
    Promise.map(await getAllKeysByGuuid(guuid), async key =>
      this.updateByKeyGuuid(key, guuid)(toUpdate)
    );

  const updateByRegexp = (regexp, value) => async toUpdate => {
    const result = await getAllByRegexp(regexp, value);
    return Promise.map(Object.keys(result), async guuid =>
      this.updateByKeyGuuid(result[guuid], guuid)(toUpdate)
    );
  };

  this.update = (key, value) => async toUpdate =>
    typeof key !== "string"
      ? updateByRegexp(key, value)(toUpdate)
      : Promise.map(await getAllGuuidByKey(key, value), async guuid =>
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

  const andUpdateValue = (asyncKeys, asyncGuuids, asyncRegexps) => toUpdate =>
    getAvailableScheduler(async (type, expression, options) => {
      const regexps = await asyncRegexps;
      const keys = regexps ? Object.keys(regexps) : await asyncKeys;
      const guuids = regexps ? Object.values(regexps) : await asyncGuuids;
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
              const value = await this.redisSetter.getAsync(
                `${key}_${guuid}_value`
              );
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

  const rescheduleByRegexp = async (regexp, value) =>
    getAvailableScheduler(
      (type, expression, options) =>
        type === "andUpdateValue"
          ? andUpdateValue(null, null, getAllByRegexp(regexp, value))(
              expression
            )
          : (async () => {
              const result = await getAllByRegexp(regexp, value);
              return Promise.map(Object.keys(result), async guuid =>
                this.rescheduleByKeyGuuid(result[guuid], guuid)[type](
                  expression,
                  options
                )
              );
            })(),
      { andUpdateValue }
    );

  this.reschedule = (key, value) =>
    typeof key !== "string"
      ? rescheduleByRegexp(key, value)
      : getAvailableScheduler(
          (type, expression, options) =>
            type === "andUpdateValue"
              ? andUpdateValue(key, getAllGuuidByKey(key, value))(expression)
              : (async () =>
                  Promise.map(await getAllGuuidByKey(key, value), async guuid =>
                    this.rescheduleByKeyGuuid(key, guuid)[type](
                      expression,
                      options
                    )
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
      if (
        elements.expiration_at &&
        parseInt(elements.expiration_at, 10) <= currentDate.getTime()
      ) {
        await executeEvents(elements.key, elements.value, elements.guuid)(
          elements.expiration_type,
          elements.expiration_expression,
          elements.expiration_extra
        )([cb]);
      }
    });
  };

  const listEvents = {};
  const listRegexp = {};
  this.on = async (key, cb) => {
    if (typeof key === "string") {
      listEvents[key] = listEvents[key] || [];
      listEvents[key].push(cb);
    }
    if (typeof key === "object") {
      const indexKey = key.toString();
      listRegexp[indexKey] = listRegexp[indexKey] || [];
      listRegexp[indexKey].push(cb);
    }
    await verifyKeyExpired(key, cb);
  };

  const listRegexpMatched = key =>
    Object.keys(listRegexp)
      .map(index =>
        RegExp(RegexParser(index)).test(key) ? listRegexp[index] : null
      )
      .reduce(
        (accumulator, currentValue) => [
          ...accumulator,
          ...(currentValue || [])
        ],
        []
      );

  // ---
  this.redisGetter.config("set", "notify-keyspace-events", "Ex");
  this.redisGetter.psubscribe("__keyevent@0__:expired");
  this.redisGetter.on("pmessage", async (_, __, expiredKey) => {
    const keys = expiredKey.split("_");
    const guuid = keys.pop();
    const key = keys.join("_");

    const listCallbacks = [
      ...(listEvents[key] || []),
      ...(listRegexpMatched(key) || [])
    ];

    if (listCallbacks.length) {
      const value = await this.redisSetter.getAsync(`${key}_${guuid}_value`);
      const expirationType = await this.redisSetter.getAsync(
        `${key}_${guuid}_expiration_type`
      );
      const expirationExpression = await this.redisSetter.getAsync(
        `${key}_${guuid}_expiration_expression`
      );
      const expirationExtra = await this.redisSetter.getAsync(
        `${key}_${guuid}_expiration_extra`
      );
      await executeEvents(key, value, guuid)(
        expirationType,
        expirationExpression,
        expirationExtra
      )(listCallbacks);
    }
  });

  return this;
};
