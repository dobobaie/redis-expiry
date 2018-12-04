const Promise = require("bluebird");
const test = require("ava");
const Redis = require("redis");

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

const redisExpiry = require("../index");

const redisUrl = process.env.REDIS_URL;

let redis = null;
let rexp = null;
test.before("Run simulator", async () => {
  redis = Redis.createClient(redisUrl);
  rexp = redisExpiry(redis, redisUrl);
});

test("Basic - Natif function", async t => {
  t.deepEqual(rexp.natif, redis, "Redis instances are different");
});

test("Basic - Set function", async t => {
  const result = await rexp.set("set_expiration", "now_call");
  t.deepEqual(
    Object.keys(result),
    ["now", "at", "cron", "timeout"],
    "Invalid method returned"
  );
});

const valueForNow = "now_call";
test("Expiration - Now function", async t => {
  const verifyKey = await rexp.get("set_expiration_for_now");
  t.deepEqual(verifyKey, [], `"set_expiration_for_now" key already exists`);
  const currentTime = new Date();
  await rexp.set("set_expiration_for_now", valueForNow).now();
  await new Promise((resolve, reject) => {
    rexp.on("set_expiration_for_now", value => {
      const newTime = new Date();
      t.is(value, valueForNow, "Expected value is not consistent");
      if (newTime.getTime() - currentTime.getTime() < 999) {
        return resolve();
      }
      return reject();
    });
    setTimeout(reject, 999);
  })
    .then(() => t.pass())
    .catch(() => t.fail(`"now" function take too much time`));
  const verifyKeyAgain = await rexp.get("set_expiration_for_now");
  t.deepEqual(
    verifyKeyAgain,
    [],
    `"set_expiration_for_now" key hasn't been removed`
  );
});

const valueForTimeout = "timeout_call";
test("Expiration - Timeout function", async t => {
  const verifyKey = await rexp.get("set_expiration_for_timeout");
  t.deepEqual(verifyKey, [], `"set_expiration_for_timeout" key already exists`);
  const currentTime = new Date();
  await rexp.set("set_expiration_for_timeout", valueForTimeout).timeout(1000);
  await new Promise((resolve, reject) => {
    rexp.on("set_expiration_for_timeout", value => {
      const newTime = new Date();
      t.is(value, valueForTimeout, "Expected value is not consistent");
      if (
        newTime.getTime() - currentTime.getTime() >= 1000 &&
        newTime.getTime() - currentTime.getTime() < 1999
      ) {
        return resolve();
      }
      return reject();
    });
    setTimeout(reject, 1999);
  })
    .then(() => t.pass())
    .catch(() => t.fail(`"timeout" function take too much time`));
  const verifyKeyAgain = await rexp.get("set_expiration_for_timeout");
  t.deepEqual(
    verifyKeyAgain,
    [],
    `"set_expiration_for_timeout" key hasn't been removed`
  );
});

const valueForCron = "cron_call";
test("Expiration - Cron function", async t => {
  const verifyKey = await rexp.get("set_expiration_for_cron");
  t.deepEqual(verifyKey, [], `"set_expiration_for_cron" key already exists`);
  const currentTime = new Date();
  const timeoutCron =
    (4 -
      ((currentTime.getSeconds() % 4) +
        currentTime.getMilliseconds() * 0.001)) *
      1000 -
    100;
  await rexp.set("set_expiration_for_cron", valueForCron).cron("*/4 * * * * *");
  await new Promise((resolve, reject) => {
    rexp.on("set_expiration_for_cron", value => {
      const newTime = new Date();
      t.is(value, valueForCron, "Expected value is not consistent");
      if (
        newTime.getTime() - currentTime.getTime() >= timeoutCron &&
        newTime.getTime() - currentTime.getTime() < timeoutCron + 999
      ) {
        return resolve();
      }
      return reject();
    });
    setTimeout(reject, timeoutCron + 999);
  })
    .then(() => t.pass())
    .catch(() => t.fail(`"cron" function take too much time`));
  const verifyKeyAgain = await rexp.get("set_expiration_for_cron");
  t.deepEqual(
    verifyKeyAgain,
    [],
    `"set_expiration_for_cron" key hasn't been removed`
  );
});

const valueForAt = "at_call";
test("Expiration - At function", async t => {
  const verifyKey = await rexp.get("set_expiration_for_at");
  t.deepEqual(verifyKey, [], `"set_expiration_for_at" key already exists`);
  const currentTime = new Date();
  const dateTest = new Date();
  dateTest.setSeconds(dateTest.getSeconds() + 3);
  await rexp.set("set_expiration_for_at", valueForAt).at(dateTest);
  await new Promise((resolve, reject) => {
    rexp.on("set_expiration_for_at", value => {
      const newTime = new Date();
      t.is(value, valueForAt, "Expected value is not consistent");
      if (
        newTime.getTime() - currentTime.getTime() >= 3000 &&
        newTime.getTime() - currentTime.getTime() < 3999
      ) {
        return resolve();
      }
      return reject();
    });
    setTimeout(reject, 3999);
  })
    .then(() => t.pass())
    .catch(() => t.fail(`"at" function take too much time`));
  const verifyKeyAgain = await rexp.get("set_expiration_for_at");
  t.deepEqual(
    verifyKeyAgain,
    [],
    `"set_expiration_for_at" key hasn't been removed`
  );
});

const valueForGet = "get_call";
test("Other - get/set/del functions", async t => {
  const verifyKey = await rexp.get("set_expiration_for_get");
  t.deepEqual(verifyKey, [], `"set_expiration_for_get" key already exists`);
  await rexp.set("set_expiration_for_get", valueForGet).timeout(100000);
  const result = (await rexp.get(
    "set_expiration_for_get",
    valueForGet
  )).shift();
  t.not(result, undefined, "Get undefined value");
  delete result.guuid;
  delete result.created_at;
  delete result.expiration_at;
  t.deepEqual(result, {
    value: valueForGet,
    expiration: 100000
  });
  await rexp.del("set_expiration_for_get", valueForGet);
  const verifyKeyAgain = await rexp.get("set_expiration_for_get");
  t.deepEqual(
    verifyKeyAgain,
    [],
    `"set_expiration_for_get" key already exists`
  );
});

test("Other - no keys in redis", async t => {
  const verifyKey = (await redis
    .multi()
    .keys(`set_expiration_for_*`)
    .execAsync()).shift();
  t.deepEqual(verifyKey, [], `there are still traces of the test`);
});
