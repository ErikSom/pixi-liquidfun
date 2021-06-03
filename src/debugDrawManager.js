import {
	makeDebugDraw
} from './debugdraw';

const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', {
	alpha: true
});

let PTM;
let world;

export const init = (_world, _PTM, Box2D) => {
	PTM = _PTM;
	world = _world;
	document.body.appendChild(canvas);
	canvas.style = `
		position:absolute;
		top:0;
		left:0;
		pointer-events: none;
	`;
	const debugDraw = makeDebugDraw(ctx, PTM, Box2D);
	world.SetDebugDraw(debugDraw);
	resize();
}

export const resize = () => {
	canvas.style.width = `${window.innerWidth}px`;
	canvas.style.height = `${window.innerHeight}px`;
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}

export const update = () => {
	ctx.clearRect(0, 0, canvas.width, canvas.height);

	ctx.save();
	ctx.scale(PTM, PTM);
	ctx.translate(canvas.width/PTM/2, canvas.height/PTM/2);
	ctx.lineWidth /= PTM;

	ctx.fillStyle = 'rgb(255,255,0)';
	world.DebugDraw();

	ctx.restore();
};
