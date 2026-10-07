// The cases, in the order the home screen lists them: the eight core cases, then the three optional ones.
import { bleed } from './bleed.js?v=74f1d13802';
import { prevention } from './prevention.js?v=a80ecb186a';
import { newAscites } from './new-ascites.js?v=48aa40243c';
import { refractory } from './refractory.js?v=71c9fdda6d';
import { gastric } from './gastric.js?v=43937283cb';
import { buddChiari } from './budd-chiari.js?v=b5c3d59b36';
import { pvt } from './pvt.js?v=57a90bfb0b';
import { nsbb } from './nsbb.js?v=09a242cfce';
import { schisto, hepatofugal, postTips } from './optional.js?v=99d73b69e0';

export const CASES = [bleed, prevention, newAscites, refractory, gastric, buddChiari, pvt, nsbb, schisto, hepatofugal, postTips];
export { ORDER_META, GROUPS } from './kit.js?v=010d07460c';
