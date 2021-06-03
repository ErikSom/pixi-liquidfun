import babel from 'rollup-plugin-babel';
import {
	terser
} from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';
import commonjs from 'rollup-plugin-commonjs';
import resolve from 'rollup-plugin-node-resolve';
import conditional from 'rollup-plugin-conditional';

const isProduction = process.env.NODE_ENV === 'production';
export default [{
		input: 'src/index.js',
		output: {
			file: 'build/liquidfun-test.js',
			format: 'iife',
			strict: false,
		},
		plugins: [
			babel({
				exclude: 'node_modules/**'
			}),
			resolve({
				preferBuiltins: false,
			}),
			commonjs(),

			conditional(isProduction, [
				terser(),
			]),

			copy({
				targets: [{
					src: 'static/*',
					dest: 'build/'
				}, ],
				verbose: true,
			}),
		],
	},
];
