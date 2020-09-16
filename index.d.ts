/* eslint-disable */ 
declare module 'redis-expiry' {
  import { RedisClient } from 'redis';
  
  export interface RexpNativeReturn {
    guuid?: string;
    value?: any;
    key?: string;
    expiration_type?: 'INFINIT' | 'TIMEOUT' | 'NOW' | 'AT' | 'CRON';
    expiration_value?: number;
    expiration_extra?: any;
    expiration_expression?: number | Date | string;
    created_at?: Date;
    expiration_at?: Date;
  }
  export type RexpSet = {
    infinit: () => Promise<RexpNativeReturn>;
    timeout: (countdown: number) => Promise<RexpNativeReturn>;
    now: () => Promise<RexpNativeReturn>;
    at: (expire_at: Date) => Promise<RexpNativeReturn>;
    cron: (expression: string, options?: any) => Promise<RexpNativeReturn>;
  };
  export type RexpLib = {
    on: (key: string, callback: (value: any, key: string, stopInterval?: Function) => void) => Promise<void>;
    set: (key: string, value?: any) => RexpSet;
    getByKeyGuuid: (key: string, guuid: string) => Promise<RexpNativeReturn>;
    getByGuuid: (guuid: string) => Promise<RexpNativeReturn>;
    // getByRegexp: (regexp: string, value?: any) => Promise<RexpNativeReturn>;
    get: (key: string, value?: any) => Promise<RexpNativeReturn>;
    delByKeyGuuid: (key: string, guuid: string) => Promise<number[]>;
    delByGuuid: (guuid: string) => Promise<number[]>;
    // delByRegexp: (key: string, value: string) => Promise<number[]>;
    del: (key: string, value: string) => Promise<number[]>;
    updateByKeyGuuid: (key: string, guuid: string) => Promise<void>;
    updateByGuuid: (guuid: string) => Promise<void>;
    // updateByRegexp: (key: string, value: string) => Promise<void>;
    update: (key: string, value: string) => Promise<void>;
    rescheduleByKeyGuuid: (key: string, guuid: string) => Promise<RexpNativeReturn>;
    rescheduleByGuuid: (guuid: string) => Promise<RexpNativeReturn>;
    // rescheduleByRegexp: (key: string, value: string) => Promise<RexpNativeReturn>;
    reschedule: (key: string, value: string) => Promise<RexpNativeReturn>;
  };
  export function redisExpiry(redisSetter: RedisClient, redisGetter: RedisClient): RexpLib;
  export default redisExpiry;
}
