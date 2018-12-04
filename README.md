# redis-expiry
Use redis to expire your keys and handling the value

## Features
* Schedule the expiration of your keys
* Handling your keys and values
* CRUD your events
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
const redis = Redis.createClient(process.env.REDIS_URL);

const redisExpiry = require("redis-expiry");
const rexp = redisExpiry(redis, process.env.REDIS_URL);
```

### Schedule a new event

Before choosing the expiration type of your key, you have to set the key/value:  

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

⚠ after expiration the event is rescheduled, bellow "Adding event handler" to stop it⚠   

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

### Cancel scheduled key

If no value is specified then every keys will be removed:

``` js  
await rexp.del("myKeyByTimeout");
```

Remove a specific key by value: 

``` js  
await rexp.del("myKeyByTimeout", "myValue");
```

### Retrieve scheduled key

If no value is specified then every keys will be returned:

``` js  
const result = await rexp.get("myKeyByTimeout");
```

Return a specific key by value:  

``` js  
const result = await rexp.get("myKeyByTimeout", "myValue");
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
const redis = Redis.createClient(process.env.REDIS_URL);

const redisExpiry = require("redis-expiry");
const rexp = redisExpiry(redis, process.env.REDIS_URL);

rexp.set("myKeyByTimeout", "myValue").timeout(60000) // key will be expire in 1 min
  .catch(err => console.error(err));

rexp.on("myKeyByTimeout", (value, key) => { // the event will always be scheduled if the application restart
  console.log("Value returned", value, "From key", key);
});

