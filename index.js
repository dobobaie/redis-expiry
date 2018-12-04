const Promise = require("bluebird");
const shortid = require("shortid");
const cronParser = require("cron-parser");
const Redis = require("redis");

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

module.exports = (redis, options) => {
  this.natif = redis;

  this.set = (key, value) => ({
    now: () => this.set(key, value).timeout(1),
    at: date => {
      const currentDate = new Date().getTime();
      const ndate = date ? new Date(date).getTime() : currentDate;
      const calculTimeout = ndate - currentDate <= 0 ? 1 : ndate - currentDate;
      return this.set(key, value).timeout(calculTimeout);
    },
    cron: expression =>
      this.set(key, value).at(
        new Date(
          cronParser
            .parseExpression(expression)
            .next()
            .toString()
        )
      ),
    timeout: async time => {
      const ntime = time || 1;
      const currentDate = new Date();
      const guuid = shortid.generate().replace(/_/g, "-");
      return Promise.all([
        redis.setAsync(`${key}_${guuid}`, "", "PX", ntime),
        redis.setAsync(`${key}_${guuid}_guuid`, guuid),
        redis.setAsync(`${key}_${guuid}_value`, value),
        redis.setAsync(`${key}_${guuid}_expiration`, ntime),
        redis.setAsync(`${key}_${guuid}_create_at`, currentDate.getTime()),
        redis.setAsync(
          `${key}_${guuid}_expiration_at`,
          currentDate.getTime() + ntime * 100
        )
      ]);
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
    const redisCreatedAt = await redis.getAsync(`${key}_${guuid}_create_at`);
    const redisExpirationAt = await redis.getAsync(
      `${key}_${guuid}_expiration_at`
    );
    return {
      guuid: redisGuuid,
      value: redisValue,
      expiration: parseFloat(redisExpiration),
      created_at: parseFloat(redisCreatedAt),
      expiration_at: parseFloat(redisExpirationAt)
    };
  };

  this.get = async (key, value) =>
    (await Promise.map(await getAllGuuid(key), async guuid => {
      const redisValue = await redis.getAsync(`${key}_${guuid}_value`);
      if (value && value !== redisValue) return null;
      return this.getByKeyGuuid(key, guuid);
    })).filter(elem => elem !== null);

  this.delByKeyGuuid = async (key, guuid) =>
    Promise.all([
      redis.del(`${key}_${guuid}`),
      redis.del(`${key}_${guuid}_value`),
      redis.del(`${key}_${guuid}_guuid`),
      redis.del(`${key}_${guuid}_expiration`),
      redis.del(`${key}_${guuid}_create_at`),
      redis.del(`${key}_${guuid}_expiration_at`)
    ]);

  this.del = async (key, value) =>
    Promise.map(await getAllGuuid(key), async guuid => {
      const redisValue = await redis.getAsync(`${key}_${guuid}_value`);
      if (value && value !== redisValue) return null;
      return this.delByKeyGuuid(key, guuid);
    });

  const listEvents = {};
  this.on = async (key, cb) => {
    listEvents[key] = listEvents[key] ? listEvents[key] : [];
    listEvents[key].push(cb);
  };

  const redisSubscriber = Redis.createClient(options);
  redisSubscriber.on("pmessage", async (pattern, channel, expiredKey) => {
    const keys = expiredKey.split("_");
    const guuid = keys.pop();
    const key = keys.join("_");
    const value = await redis.getAsync(`${key}_${guuid}_value`);

    if (listEvents[key]) {
      listEvents[key].map(async cb => cb(value, key));
      await this.delByKeyGuuid(key, guuid);
    }
  });
  redisSubscriber.psubscribe("__keyevent@0__:expired");

  return this;
};
