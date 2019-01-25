const redisUrl = process.env.REDIS_URL;

const Promise = require("bluebird");

const Redis = require("redis");

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

const redisExpiry = require("../index");

const redisSetter = Redis.createClient(redisUrl);
const redisGetter = Redis.createClient(redisUrl);

const rexp = redisExpiry(redisSetter, redisGetter);

// ---

rexp
  .set("myKeyByTimeout", "myValue")
  .timeout(15000)
  .catch(err => console.error(err));

rexp.on("myKeyByTimeout", (value, key) => {
  console.log("Value returned", value, "From key", key);
});

// ---

rexp
  .set("myKeyByTimeout_regexp", "myValueRegex")
  .timeout(15000)
  .catch(err => console.error(err));

rexp
  .set("myKeyByTimeout2_regexp", "myValueRegex42")
  .timeout(15000)
  .catch(err => console.error(err));

rexp
  .set("myKeyByTimeout3_regexp", "myValueRegex3")
  .timeout(15000)
  .catch(err => console.error(err));

rexp
  .set("myKeyByTimeout23_regexp", "myValueRegex4")
  .timeout(15000)
  .catch(err => console.error(err));

rexp.del(/(.*)3_regexp/).catch(err => console.error(err));

rexp.update("myKeyByTimeout2_regexp")("myValueRegex2");

rexp.on(/(.*)_regexp/, (value, key) => {
  console.log("Value returned", value, "From key", key);
});
