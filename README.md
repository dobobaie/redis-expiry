[![Build Status](https://travis-ci.com/dobobaie/redis-expiry.svg?branch=master)](https://travis-ci.com/dobobaie/redis-expiry)

# redis-expiry
Use redis to expire your keys and handling the value  

## Features
* Schedule the expiration of your keys
* Handling your keys and values
* CRUD your scheduler + rescheduling
* Save multiple values in a single key
* Retrieve your value when the key expire
* Add cron task

## Installation

```
$ npm install redis-expiry
```

## Usage

### Initialization

Create a new instance :

``` js  
const Redis = require("redis");
const redisExpiry = require("redis-expiry");

const redisSetter = Redis.createClient(process.env.REDIS_URL);
const redisGetter = Redis.createClient(process.env.REDIS_URL);

const rexp = redisExpiry(redisSetter, redisGetter);
```

The code bellow is deprecated since v1.0.4  

```
const rexp = redisExpiry(redisSetter, process.env.REDIS_URL);
```

### Schedule a new scheduler

Before choosing the type of expiration, you have to set the key/value:  

``` js  
rexp.set("myKey", "myValue")...
```

**rexp.set(...).at(date);**  
Schedule from a date:  
``` js  
const currentDate = new Date();
currentDate.setSeconds(currentDate.getSeconds() + 30);
await rexp.set("myKeyByAt", "myValue").at(currentDate);
```

`myKeyByAt` will expire in 30 seconds.  

  
**rexp.set(...).timeout(integer);**  
Schedule from a timeout:  
``` js  
await rexp.set("myKeyByTimeout", "myValue").timeout(60000);
```

`myKeyByTimeout` will expire in 60 seconds.  

  
**rexp.set(...).now();**  
Schedule from now:  
``` js  
await rexp.set("myKeyByNow", "myValue").now();
```

`myKeyByNow` will expire in few milliseconds.  
  

**rexp.set(...).cron();**  
Schedule from cron:  
``` js  
await rexp.set("myKeyByCron", "myValue").cron("*/4 * * * * *");
```

`myKeyByCron` will expire in the next multiple of 4 seconds.  

⚠ after expiration the event is rescheduled, bellow "Adding event handler" to stop it ⚠   

More information: [https://www.npmjs.com/package/cron-parser](https://www.npmjs.com/package/cron-parser)  
  
### Adding event handler

The handler will be call every time a specified key expires:  

``` js  
rexp.on("myKeyByTimeout", (value, key) => {
  // value === "myValue"
});
```
 
To stop the cron task execute `stop` parameter:  
``` js  
rexp.on("myKeyByTimeout", (value, key, stop) => {
  stop(); // stop cron task
});
```

### Cancel scheduler

If no value is specified then every keys will be removed:

``` js  
await rexp.del("myKeyByTimeout");
```

Remove specific contents by value: 

``` js  
await rexp.del("myKeyByTimeout", "myValue");
```

By guuid:  

``` js  
await rexp.delByGuuid("Dzokijo");
```

### Retrieve scheduler

If no value is specified then every keys will be returned:

``` js  
const result = await rexp.get("myKeyByTimeout");
```

Return specific contents by value:  

``` js  
const result = await rexp.get("myKeyByTimeout", "myValue");
```

By guuid:  

``` js  
await rexp.getByGuuid("Dzokijo");
```

### Edit scheduled value

If no value is specified then every keys will be updated:

``` js  
const result = await rexp.update("myKeyByTimeout")("myNewKey");
```

Update specific contents by value:  

``` js  
const result = await rexp.update("myKeyByTimeout", "myValue")("myNewKey");
```

By guuid:  

``` js  
await rexp.updateByGuuid("Dzokijo")("myNewKey");
```

### Reschedule a scheduler

Reschedule date:  
``` js  
const currentDate = new Date();
currentDate.setSeconds(currentDate.getSeconds() + 30);
await rexp.reschedule("myKeyByAt", "myValue").at(currentDate);
```
  
Reschedule timeout:  
``` js  
await rexp.reschedule("myKeyByTimeout", "myValue").timeout(60000);
```
  
Reschedule now:  
``` js  
await rexp.reschedule("myKeyByNow", "myValue").now();
```
  
Reschedule cron:  
``` js  
await rexp.reschedule("myKeyByCron", "myValue").cron("*/4 * * * * *");
```
  
Reschedule all contents :  
  
``` js  
await rexp.reschedule("myKeyByTimeout")[...];
```
  
By guuid:  

``` js  
await rexp.rescheduleByGuuid("Dzokijo")[...];
```
  
## Testing

Clone the repo and run from the project root:

```
$ npm install
$ npm test
```

## Examples

``` js  
const Redis = require("redis");
const redisExpiry = require("redis-expiry");

const redisSetter = Redis.createClient(process.env.REDIS_URL);
const redisGetter = Redis.createClient(process.env.REDIS_URL);

const rexp = redisExpiry(redisSetter, redisGetter);

rexp.set("myKeyByTimeout", "myValue").timeout(60000) // key will be expire in 60sec
  .catch(err => console.error(err));

rexp.on("myKeyByTimeout", (value, key) => { // event will always be scheduled if the application restart
  console.log("Value returned", value, "From key", key);
});

