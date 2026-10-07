// The cases, in the order the home screen lists them: the eight core cases, then the three optional ones.
import { bleed } from './bleed.js?v=35280a2815';
import { prevention } from './prevention.js?v=6771185c65';
import { newAscites } from './new-ascites.js?v=0e962580e5';
import { refractory } from './refractory.js?v=e736af0b4a';
import { gastric } from './gastric.js?v=ec69f734b8';
import { buddChiari } from './budd-chiari.js?v=92829efc75';
import { pvt } from './pvt.js?v=e6a9b04d7c';
import { nsbb } from './nsbb.js?v=12fb462d54';
import { schisto, hepatofugal, postTips } from './optional.js?v=96e588a5b8';

export const CASES = [bleed, prevention, newAscites, refractory, gastric, buddChiari, pvt, nsbb, schisto, hepatofugal, postTips];
export { ORDER_META, GROUPS } from './kit.js?v=58f5848647';
