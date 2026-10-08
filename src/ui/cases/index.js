// The cases, in the order the home screen lists them: the eight core cases, then the three optional ones.
import { bleed } from './bleed.js?v=95386ce46b';
import { prevention } from './prevention.js?v=41c3efa8bf';
import { newAscites } from './new-ascites.js?v=63b5e28e41';
import { refractory } from './refractory.js?v=e22c9d0e9b';
import { gastric } from './gastric.js?v=13feefae5e';
import { buddChiari } from './budd-chiari.js?v=c43db42071';
import { pvt } from './pvt.js?v=96fe766416';
import { nsbb } from './nsbb.js?v=8da3e02ff2';
import { schisto, hepatofugal, postTips } from './optional.js?v=9d8a89d5f3';

export const CASES = [bleed, prevention, newAscites, refractory, gastric, buddChiari, pvt, nsbb, schisto, hepatofugal, postTips];
export { ORDER_META, GROUPS } from './kit.js?v=4021282d5c';
