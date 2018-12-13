const redisUrl = process.env.REDIS_URL;

const Promise = require("bluebird");
const test = require("ava");

const Redis = require("redis");

Promise.promisifyAll(Redis.RedisClient.prototype);
Promise.promisifyAll(Redis.Multi.prototype);

const redisExpiry = require("../index");

const redisSetter = Redis.createClient(redisUrl);
const redisGetter = Redis.createClient(redisUrl);
const rexp = redisExpiry(redisSetter, redisGetter);

test("Basic - Natif function", async t => {
  t.deepEqual(rexp.natif, redisSetter, "Redis instances are different");
});

test("Basic - Set function", async t => {
  const result = await rexp.set("set_expiration", "now_call");
  t.deepEqual(
    Object.keys(result),
    ["timeout", "now", "at", "cron"],
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
    rexp.on("set_expiration_for_cron", (value, guuid, stop) => {
      stop();
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

const valueForCronRepeatMode = "cron_repeat_mode_call";
test("Expiration - Cron function (repeate mode)", async t => {
  let countRepeat = 0;
  const currentTime = new Date();
  const timeoutCron =
    (4 -
      ((currentTime.getSeconds() % 4) +
        currentTime.getMilliseconds() * 0.001)) *
      1000 -
    100;
  const result = await rexp
    .set("set_expiration_for_cron_repeat_mode", valueForCronRepeatMode)
    .cron("*/4 * * * * *");
  await new Promise((resolve, reject) => {
    rexp.on("set_expiration_for_cron_repeat_mode", (value, guuid, stop) => {
      countRepeat += 1;
      if (countRepeat === 3) {
        stop();
        resolve();
      }
    });
    setTimeout(reject, timeoutCron + 4000 * 2 + 999);
  })
    .then(() => t.pass())
    .catch(() => t.fail(`"cron" function take too much time`));
  t.is(
    result.expiration_extra,
    undefined,
    "`expiration_extra` field is different than the original"
  );
});

const valueForCronOptionsMode = "cron_options_mode_call";
test("Expiration - Cron function (options mode)", async t => {
  const currentTime = new Date();
  const currentDateCron = new Date();
  currentDateCron.setSeconds(currentDateCron.getSeconds() + 6);
  const timeoutCron =
    (4 -
      ((currentTime.getSeconds() % 4) +
        currentTime.getMilliseconds() * 0.001)) *
      1000 -
    100 +
    4000;
  const result = await rexp
    .set("set_expiration_for_cron_options_mode", valueForCronOptionsMode)
    .cron("*/4 * * * * *", {
      currentDate: currentDateCron
    });
  await new Promise((resolve, reject) => {
    rexp.on("set_expiration_for_cron_options_mode", (value, guuid, stop) => {
      stop();
      const newTime = new Date();
      t.is(value, valueForCronOptionsMode, "Expected value is not consistent");
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
  t.deepEqual(
    result.expiration_extra,
    {
      currentDate: currentDateCron
    },
    "`expiration_extra` field is different than the original"
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

const valueForOn = "on_call";
test("Other - on event after key has been expired", async t => {
  const verifyKey = await rexp.get("set_expiration_for_on");
  t.deepEqual(verifyKey, [], `"set_expiration_for_on" key already exists`);
  const currentTime = new Date();
  await rexp.set("set_expiration_for_on", valueForOn).now();
  await new Promise((resolve, reject) => {
    setTimeout(() => {
      rexp.on("set_expiration_for_on", value => {
        const newTime = new Date();
        t.is(value, valueForOn, "Expected value is not consistent");
        if (newTime.getTime() - currentTime.getTime() < 2999) {
          return resolve();
        }
        return reject();
      });
      setTimeout(reject, 999);
    }, 2000);
  })
    .then(() => t.pass())
    .catch(err => t.fail(`"on" event take too much time${err}`));
  const verifyKeyAgain = await rexp.get("set_expiration_for_on");
  t.deepEqual(
    verifyKeyAgain,
    [],
    `"set_expiration_for_on" key hasn't been removed`
  );
});

const valueForGet = "get_call";
test("Other - get/set/del/update functions", async t => {
  const verifyKey = await rexp.get("set_expiration_for_get");
  t.deepEqual(verifyKey, [], `"set_expiration_for_get" key already exists`);
  // ---
  const rSet = await rexp
    .set("set_expiration_for_get", valueForGet)
    .timeout(100000);
  const result = (await rexp.get(
    "set_expiration_for_get",
    valueForGet
  )).shift();
  t.deepEqual(result, rSet, "`get` result is different than `set` return");
  delete result.guuid;
  delete result.created_at;
  delete result.expiration_at;
  t.deepEqual(
    result,
    {
      value: valueForGet,
      expiration_type: "TIMEOUT",
      expiration_value: 100000,
      expiration_expression: 100000,
      expiration_extra: undefined
    },
    "`get` result have some different fields than the original"
  );
  // ---
  rSet.value = "get_new_call";
  await rexp.update("set_expiration_for_get", valueForGet)(rSet.value);
  const resultBadValue = await rexp.get("set_expiration_for_get", valueForGet);
  t.deepEqual(resultBadValue, [], "old value was wrongly deleted");
  const resultSuccessValue = (await rexp.get(
    "set_expiration_for_get",
    rSet.value
  )).shift();
  t.deepEqual(
    resultSuccessValue,
    rSet,
    "`get` result is different than the data updated"
  );
  // ---
  await rexp.del("set_expiration_for_get", rSet.value);
  const verifyKeyAgain = await rexp.get("set_expiration_for_get");
  t.deepEqual(
    verifyKeyAgain,
    [],
    `"set_expiration_for_get" key already exists`
  );
});

const valueForGetByGuuid = "get_by_guuid_call";
test("Other - getByGuuid/delByGuuid/delByGuuid functions", async t => {
  const rSet = await rexp
    .set("set_expiration_for_guuid", valueForGetByGuuid)
    .now();
  const result = await rexp.getByGuuid(rSet.guuid);
  t.deepEqual(rSet, result, "getByGuuid doesn't works");
  // ---
  rSet.value = "get_by_guuid_new_call";
  await rexp.updateByGuuid(rSet.guuid)(rSet.value);
  const resultUpdate = await rexp.getByGuuid(rSet.guuid);
  t.deepEqual(rSet, resultUpdate, "updateByGuuid doesn't works");
  // ---
  await rexp.delByGuuid(rSet.guuid);
  const resultDelete = await rexp.getByGuuid(rSet.guuid);
  t.is(undefined, resultDelete, "delByGuuid doesn't works");
});

test("Other - no keys in redis", async t => {
  const verifyKey = (await redisSetter
    .multi()
    .keys(`set_expiration_for_*`)
    .execAsync()).shift();
  t.deepEqual(verifyKey, [], `there are still traces of the test`);
});

test.serial("Removing traces", async t =>
  (() => t.pass())(
    await Promise.map(
      await (await redisSetter
        .multi()
        .keys(`set_expiration_for_*`)
        .execAsync()).shift(),
      element => redisSetter.del(element)
    )
  )
);
