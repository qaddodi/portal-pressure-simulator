// The cases, in the order the home screen lists them: the eight core cases, then the optional ones.
import { bleed } from './bleed.js?v=a3ab73ecb2';
import { prevention } from './prevention.js?v=82c1536d92';
import { newAscites } from './new-ascites.js?v=1ea61ce0f3';
import { refractory } from './refractory.js?v=d93f8d2a47';
import { gastric } from './gastric.js?v=78faaae5e3';
import { buddChiari } from './budd-chiari.js?v=fcf350fe30';
import { pvt } from './pvt.js?v=3d2b9623b0';
import { nsbb } from './nsbb.js?v=5942d20c73';
import { treatCause } from './treat-cause.js?v=704978b722';
import { schisto, hepatofugal, postTips } from './optional.js?v=f0406205c5';

export const CASES = [bleed, prevention, newAscites, refractory, gastric, buddChiari, pvt, nsbb, schisto, hepatofugal, postTips, treatCause];
export { ORDER_META, GROUPS } from './kit.js?v=be90db496b';
