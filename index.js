const Promise = require("bluebird");
const shortid = require("shortid");
const cronParser = require("cron-parser");
const Redis = require("redis");

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

module.exports = (redis, options) => {
  this.natif = redis;

  const scheduleEvent = (expirationType, expirationValue) => (
    key,
    value,
    timeout
  ) => {
    const currentDate = new Date().getTime();
    const guuid = shortid.generate().replace(/_/g, "-");
    return Promise.all([
      redis.setAsync(`${key}_${guuid}`, "", "PX", timeout),
      redis.setAsync(`${key}_${guuid}_guuid`, guuid),
      redis.setAsync(`${key}_${guuid}_value`, value),
      redis.setAsync(`${key}_${guuid}_expiration`, timeout),
      redis.setAsync(`${key}_${guuid}_expiration_type`, expirationType),
      redis.setAsync(`${key}_${guuid}_expiration_value`, expirationValue),
      redis.setAsync(`${key}_${guuid}_create_at`, currentDate),
      redis.setAsync(
        `${key}_${guuid}_expiration_at`,
        currentDate + timeout * 100
      )
    ]);
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

  const getAllGuuid = async key =>
    Object.values(
      await (await redis
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

  this.getByKeyGuuid = async (key, guuid) => {
    const redisValue = await redis.getAsync(`${key}_${guuid}_value`);
    const redisGuuid = await redis.getAsync(`${key}_${guuid}_guuid`);
    const redisExpiration = await redis.getAsync(`${key}_${guuid}_expiration`);
    const redisExpirationType = await redis.getAsync(
      `${key}_${guuid}_expiration_type`
    );
    const redisExpirationValue = await redis.getAsync(
      `${key}_${guuid}_expiration_value`
    );
    const redisCreatedAt = await redis.getAsync(`${key}_${guuid}_create_at`);
    const redisExpirationAt = await redis.getAsync(
      `${key}_${guuid}_expiration_at`
    );
    return {
      guuid: redisGuuid,
      value: redisValue,
      expiration: parseFloat(redisExpiration),
      expiration_type: redisExpirationType,
      expiration_value: redisExpirationValue,
      created_at: parseFloat(redisCreatedAt),
      expiration_at: parseFloat(redisExpirationAt)
    };
  };

  this.get = async (key, value) =>
    (await Promise.map(await getAllGuuid(key), async guuid => {
      const redisValue = await redis.getAsync(`${key}_${guuid}_value`);
      if (!redisValue || (value && value !== redisValue)) return null;
      return this.getByKeyGuuid(key, guuid);
    })).filter(elem => elem !== null);

  this.delByKeyGuuid = (key, guuid) =>
    Promise.all([
      redis.del(`${key}_${guuid}`),
      redis.del(`${key}_${guuid}_value`),
      redis.del(`${key}_${guuid}_guuid`),
      redis.del(`${key}_${guuid}_expiration`),
      redis.del(`${key}_${guuid}_expiration_type`),
      redis.del(`${key}_${guuid}_expiration_value`),
      redis.del(`${key}_${guuid}_create_at`),
      redis.del(`${key}_${guuid}_expiration_at`)
    ]);

  this.del = async (key, value) =>
    Promise.map(await getAllGuuid(key), async guuid => {
      const redisValue = await redis.getAsync(`${key}_${guuid}_value`);
      if (value && value !== redisValue) return null;
      return this.delByKeyGuuid(key, guuid);
    });

  const executeEvents = (key, value, guuid) => (
    expirationType,
    expirationValue
  ) => async list => {
    let isInterval = expirationType === "CRON";
    if (value && !Number.isNaN(value)) {
      await Promise.map(list, cb =>
        cb(value, key, () => {
          isInterval = false;
        })
      );
      if (isInterval) {
        await this.set(key, value).cron(expirationValue);
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
          elements.expiration_value
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

  const redisSubscriber = Redis.createClient(options);
  redisSubscriber.on("pmessage", async (pattern, channel, expiredKey) => {
    const keys = expiredKey.split("_");
    const guuid = keys.pop();
    const key = keys.join("_");

    if (listEvents[key]) {
      const value = await redis.getAsync(`${key}_${guuid}_value`);
      const expirationType = await redis.getAsync(
        `${key}_${guuid}_expiration_type`
      );
      const expirationValue = await redis.getAsync(
        `${key}_${guuid}_expiration_value`
      );
      await executeEvents(key, value, guuid)(expirationType, expirationValue)(
        listEvents[key]
      );
    }
  });
  redisSubscriber.psubscribe("__keyevent@0__:expired");

  return this;
};
