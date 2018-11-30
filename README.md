# redis-expiry
Use redis to expire your keys and handling the value

## Features
* Schedule the expiration of your keys
* Handling your keys and values
* CRUD your events
* Save multiple values in a single key
* Retrieve your value when the key expires

## Installation

```
$ npm install redis-expiry
```

## Usage

### Initialization

Create a new instance

``` js  
const Redis = require("redis");
const redis = Redis.createClient(process.env.REDIS_URL);

const redisExpiry = require("redis-expiry");
const rexp = redisExpiry(redis, process.env.REDIS_URL);
```

### Schedule a new event

Before choosing the type of expiration of your key, you have to set the key:  

``` js  
rexp.set("myKey", "myValue")...
```

**rexp.set(...).at(date);**  
``` js  
const currentDate = new Date();
currentDate.setSeconds(currentDate.getSeconds() + 30);
await rexp.set("myKeyByAt", "myValue").at(currentDate);
```

`myKeyByAt` will expirate in 30 seconds.  

**rexp.set(...).timeout(integer);**  
``` js  
await rexp.set("myKeyByTimeout", "myValue").timeout(60000);
```

`myKeyByTimeout` will expirate in 60 seconds.  

**rexp.set(...).now();**  
``` js  
await rexp.set("myKeyByNow", "myValue").now();
```

`myKeyByNow` will expirate in few milliseconds.  


### Adding event handler

The handler will be call every time a key specified expires  

``` js  
rexp.on("myKeyByTimeout", (value, key) => {
  // value === "myValue"
});
```

### Cancel scheduled key

If no value is specified then every keys will be removed

``` js  
await rexp.del("myKeyByTimeout");
```

Remove a specific key by value 

``` js  
await rexp.del("myKeyByTimeout", "myValue");
```

### Retrieve scheduled key

If no value is specified then every keys will be returned

``` js  
const result = await rexp.get("myKeyByTimeout");
```

Return a specific key by value  

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

(async () => {
  await rexp.set("myKeyByTimeout", "myValue").timeout(60000);
  rexp.on("myKeyByTimeout", (value, key) => {
    console.log("Value returned", value, "From key", key);
  });
})();

```

## TODO

Implement => [https://www.npmjs.com/package/cron-parser](https://www.npmjs.com/package/cron-parser)
