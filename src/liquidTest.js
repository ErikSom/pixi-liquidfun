import * as PIXI from 'pixi.js'
import * as debugDrawManager from './debugDrawManager'
import GameStats from 'gamestats.js'

const stats = new GameStats();

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

	const pixelsPerMeter = 100

	const gravity = new Box2D.b2Vec2(0, 10)
	world = new Box2D.b2World(gravity)
	Box2D.destroy(gravity)

	document.body.appendChild(app.view);

    app.view.style = `
    position:absolute;
    top:0;
    left:0;
    pointer-events: none;
    `
	debugDrawManager.init(world, pixelsPerMeter, Box2D);

	const bd = new Box2D.b2BodyDef()
	const ground = world.CreateBody(bd)

	bd.type = Box2D.b2_dynamicBody
	bd.allowSleep = false
	bd.position.Set(0, 1)
	const body = world.CreateBody(bd)
	Box2D.destroy(bd)

	const temp = new Box2D.b2Vec2(0, 0)
	const shape = new Box2D.b2PolygonShape()

    const w = 4;
    const h = 2;
    const s = 0.05;

	for (const [hx, hy, x, y] of [
			[s, h, w, 0],
			[s, h, -w, 0],
			[w, s, 0, h],
			[w, s, 0, -h]
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
	shape.SetAsBox(3.0, 1.2, temp, 0)
	const particleGroupDef = new Box2D.b2ParticleGroupDef()
    particleGroupDef.color.Set(new Box2D.b2Color(0, 0.6, 1.0));
	particleGroupDef.shape = shape
	particleSystem.CreateParticleGroup(particleGroupDef)
	Box2D.destroy(particleGroupDef)
	Box2D.destroy(shape)
	Box2D.destroy(temp)



	mesh = new ParticleMesh(particleSystem.GetParticleCount());
	mesh.filterArea = app.screen;
	mesh.filters = [
		new PIXI.filters.BlurFilter(2),
		new PIXI.filters.BlurFilter(),
		new Threshold(0.12, 0.0)
	]
	mesh.posArray = new Float32Array(Box2D.HEAPF32.buffer, Box2D.getPointer(particleSystem.GetPositionBuffer()), particleSystem.GetParticleCount() * 2);
	mesh.colorArray = new Uint8Array(Box2D.HEAPF32.buffer, Box2D.getPointer(particleSystem.GetColorBuffer()), particleSystem.GetParticleCount() * 4);
	mesh.scale.set(pixelsPerMeter);

	app.stage.addChild(mesh);

	window.addEventListener('resize', resize);
    resize();

    document.body.appendChild( stats.dom );
    console.log('#particles:', particleSystem.GetParticleCount());

	animate();
}

const resize = ()=> {
    const w = window.innerWidth;
    const h = window.innerHeight;

    app.view.style.width = `${w}px`;
    app.view.style.height = `${h}px`;
    app.renderer.resize(w, h);

    mesh.x = window.innerWidth / 2;
	mesh.y = window.innerHeight / 2;

    debugDrawManager.resize()
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
    stats.begin();
	joint.SetMotorSpeed(0.05 * Math.cos(performance.now()/1000) * Math.PI)
	world.Step(timeStep, 1, 1, 3)
	debugDrawManager.update();
    stats.end();
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
    constructor(thr = 0.5)
    {
        super(null, pass, {
            uThreshold: thr,
        });
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
    gl_PointSize = 4.0;

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
        this.geometry.buffers.forEach((e) => e.update());
        this.lastDirtyId = this.dirtyId;

        super.render(r);
    }
}
