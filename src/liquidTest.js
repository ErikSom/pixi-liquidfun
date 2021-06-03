import * as PIXI from 'pixi.js'
import * as debugDrawManager from './debugDrawManager'


let app;
let mesh;
let world;
let timeStep = 1/60;
let joint;
let particleSystem;

export const init = Box2D => {
	window.Box2D = Box2D

	app = new PIXI.Application({
		width: window.innerWidth,
		height: window.innerHeight,
		backgroundColor: 0x2c3e50
	});
	document.body.appendChild(app.view);

	const pixelsPerMeter = 100

	const gravity = new Box2D.b2Vec2(0, 10)
	world = new Box2D.b2World(gravity)
	Box2D.destroy(gravity)

	debugDrawManager.init(world, pixelsPerMeter, Box2D);

	window.addEventListener('resize', debugDrawManager.resize);


	const bd = new Box2D.b2BodyDef()
	const ground = world.CreateBody(bd)

	bd.type = Box2D.b2_dynamicBody
	bd.allowSleep = false
	bd.position.Set(0, 1)
	const body = world.CreateBody(bd)
	Box2D.destroy(bd)

	const temp = new Box2D.b2Vec2(0, 0)
	const shape = new Box2D.b2PolygonShape()

	for (const [hx, hy, x, y] of [
			[0.05, 1, 2, 0],
			[0.05, 1, -2, 0],
			[2, 0.05, 0, 1],
			[2, 0.05, 0, -1]
		]) {
		temp.Set(x, y)
		shape.SetAsBox(hx, hy, temp, 0)
		body.CreateFixture(shape, 5)
	}

	const jd = new Box2D.b2RevoluteJointDef()
	jd.motorSpeed = 0.05 * Math.PI
	jd.maxMotorTorque = 1e7
	jd.enableMotor = true
	temp.Set(0, 1)
	jd.Initialize(ground, body, temp)
	joint = Box2D.castObject(world.CreateJoint(jd), Box2D.b2RevoluteJoint)
	Box2D.destroy(jd)

	const psd = new Box2D.b2ParticleSystemDef()
	psd.radius = 0.025;
	psd.dampingStrength = 0.2;

	particleSystem = world.CreateParticleSystem(psd);

	Box2D.destroy(psd)

	temp.Set(0, 1)
	shape.SetAsBox(0.9, 0.9, temp, 0)
	const particleGroupDef = new Box2D.b2ParticleGroupDef()
	particleGroupDef.shape = shape
	particleSystem.CreateParticleGroup(particleGroupDef)
	Box2D.destroy(particleGroupDef)
	Box2D.destroy(shape)
	Box2D.destroy(temp)



	mesh = new ParticleMesh(particleSystem.GetParticleCount());
	mesh.filterArea = app.screen;
	mesh.filters = [
		new PIXI.filters.BlurFilter(40),
		new PIXI.filters.BlurFilter(10),
		new PIXI.filters.BlurFilter(2),
		new Threshold(0.2, 0.0)
	]
	mesh.posArray = new Float32Array(Box2D.HEAPF32.buffer, Box2D.getPointer(particleSystem.GetPositionBuffer()), particleSystem.GetParticleCount() * 2);
	mesh.colorArray = new Uint8Array(Box2D.HEAPF32.buffer, Box2D.getPointer(particleSystem.GetColorBuffer()), particleSystem.GetParticleCount() * 4);
	mesh.scale.set(pixelsPerMeter);

	mesh.x = window.innerWidth / 2;
	mesh.y = window.innerWidth / 2;
	app.stage.addChild(mesh);

	animate();
}

let then, now;
const animate = newtime => {
	if (!then) then = performance.now();
	requestAnimationFrame(animate);
	now = newtime;
	const elapsed = now - then;
	if (elapsed > timeStep) {
		then = now - (elapsed % timeStep);
		update();
	}
}

const update = () => {
	joint.SetMotorSpeed(0.05 * Math.cos(performance.now()/1000) * Math.PI)
	world.Step(timeStep, 1, 1, 3)
	debugDrawManager.update();
}


const pass = `
#define RAD 10.0
precision highp float;
varying vec2 vTextureCoord;

uniform sampler2D uSampler;
uniform float uThreshold;

uniform vec4 inputSize;

void main(void)
{
    float alpha = texture2D(uSampler, vTextureCoord).a;
    float border = smoothstep(uThreshold, uThreshold, alpha);

    vec4 color = vec4(texture2D(uSampler, vTextureCoord).rgb, 1) * border;
  
    gl_FragColor = color;
}
`
class Threshold extends PIXI.Filter
{
    constructor(thr = 0.5, gap = 0.01)
    {
        super(null, pass, {
            uThreshold: thr,
        });
    }
}

class PartPoint {
    constructor(buffer, index) {
        this.data = new Float32Array(buffer.buffer, index * 6 * 4, 6);
        this._color = 0x0;
        this.size = 40;

        this.onDirty = null;
    }

    set size(v) {
        if (this.size !== v) {
            this.data[5] = v;
            this.onDirty && this.onDirty();
        }
    }

    get size() {
        return this.data[5];
    }

    set x (v) {
        if (this.x !== v) {
            this.data[0] = v;
            this.onDirty && this.onDirty();
        }
    }

    set y (v) {
        if (this.y !== v) {
            this.data[1] = v;
            this.onDirty && this.onDirty();
        }
    }

    get x() {
        return this.data[0];
    }

    get y() {
        return this.data[1];
    }

    set color(v) {
        if (v !== this._color) {
            const rgb = PIXI.utils.hex2rgb(v);
            this._color = v;
            this.data[2] = rgb[0];
            this.data[3] = rgb[1];
            this.data[4] = rgb[2];
            this.onDirty && this.onDirty();
        }
    }

    get color() {
        return this._color;
    }
}

const _VERT = `
attribute vec2 aPos;
attribute vec3 aColor;

uniform mat3 projectionMatrix;
uniform mat3 translationMatrix;
uniform mat3 uTextureMatrix;

varying vec4 vColor;

void main(void)
{
    gl_Position = vec4((projectionMatrix * translationMatrix * vec3(aPos, 1.0)).xy, 0.0, 1.0);
    gl_PointSize = 100.0;

    vColor = vec4(aColor, 1.0);
}
`;

const _FRAG = `
varying vec4 vColor;

void main(void)
{
    vec2 circCoord = 2.0 * gl_PointCoord - 1.0;

    gl_FragColor = vColor * (1. - smoothstep(0.9, 1.0, dot(circCoord, circCoord)));
}
`;
class ParticleMesh extends PIXI.Mesh {
    constructor(max = 1000) {
        super(
            new PIXI.Geometry(),
            new PIXI.MeshMaterial(PIXI.Texture.WHITE, {
                program: PIXI.Program.from(_VERT, _FRAG)
            }),
            null,
            PIXI.DRAW_MODES.POINTS
        );

        this.pool = [];
        this.max = max;
        this._posArray = new Float32Array(this.max * 2);
        this._colorArray = new Uint8Array(this.max * 4);

        this.points = [];
        this._realSize = 0;

        const posBuff = new PIXI.Buffer(this._posArray, false, false);
        const colorBuff = new PIXI.Buffer(this._colorArray, false, false);

        this.geometry
            .addAttribute('aPos', posBuff, 2, false, PIXI.TYPES.FLOAT)
            .addAttribute('aColor', colorBuff, 4, true, PIXI.TYPES.UNSIGNED_BYTE)
        
        this.dirtyId = 0;
        this.lastDirtyId = 0;
    }

    createPoint(data = {}) {
        if (this.points.length === this.max) {
            return null;
        }

        const p = this.pool.pop() || new PartPoint(this.posArray, this.colorArray, this.points.length, this);
        p._destroyed = false;

        p.x = data.x || 0;
        p.y = data.y || 0;
        p.color = data.color || 0x0;
        p.size = data.size || 40;

        p.onDirty = this._onDirty.bind(this);

        this.points.push(p);
        this._realSize = Math.max(this._realSize,  this.points.length);
        this.size = this._realSize;

        return p;
    }

    _pushPool(el) {
        const index = this.points.indexOf(el);

        if (index > 0) {
            this.points.splice(index, 1);
            this.pool.push(this);
        }

        if (index === this.points.length) {
            this._realSize --;
            this.size = this._realSize;
        }
    }

    _onDirty() {
        this.dirtyId ++;
    }

	set posArray(data) {
        return this.geometry.getBuffer('aPos').update(data);
    }

    get posArray() {
        return this.geometry.getBuffer('aPos').data;
    }


    set colorArray(data) {
        return this.geometry.getBuffer('aColor').update(data);
    }

    get colorArray() {
        return this.geometry.getBuffer('aColor').data;
    }

    render(r) {
        if (this.dirtyId !== this.lastDirtyId) {
            this.geometry.buffers.forEach((e) => e.update());
            this.lastDirtyId = this.dirtyId;
        }

        super.render(r);
    }
}
