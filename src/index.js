import Box2DFactory from "./Box2D";

import * as liquidTest from './liquidTest'
Box2DFactory().then(Box2D => liquidTest.init(Box2D));
