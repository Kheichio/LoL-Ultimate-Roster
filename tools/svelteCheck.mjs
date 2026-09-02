// ---------------------------------------------------------------------------
//  svelteCheck -- compile named .svelte files and report template errors.
//
//  A cheap, PARALLEL-SAFE stand-in for `npm run build` when several people (or
//  agents) are editing sibling components at once: `vite build` writes to a
//  shared dist/ and two concurrent runs corrupt each other's output, while this
//  touches nothing on disk at all.
//
//  It is NOT a substitute for tools/careerRender.mjs. This proves a component
//  PARSES and COMPILES; careerRender proves it RENDERS against 50 real and
//  deliberately rotted game states, which is where unguarded reads actually
//  blow up. Run both.
//
//  Usage:
//    node tools/svelteCheck.mjs                          -- every .svelte in src/
//    node tools/svelteCheck.mjs src/lib/components/career/Hub.svelte ...
// ---------------------------------------------------------------------------
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { compile } from 'svelte/compiler';

const ROOT = process.cwd();

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.svelte')) out.push(p);
    }
    return out;
}

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const files = args.length ? args.map(a => join(ROOT, a)) : walk(join(ROOT, 'src'));

let bad = 0;
let warnings = 0;
for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    let source;
    try {
        source = readFileSync(file, 'utf8');
    } catch (e) {
        console.log(`  FAIL  ${rel}\n        cannot read: ${e.message}`);
        bad++;
        continue;
    }
    try {
        // generate: 'ssr' matches how careerRender actually loads these
        // components, so a construct that only breaks server-side is caught
        // here rather than three harnesses later.
        const res = compile(source, { filename: rel, generate: 'ssr', dev: false });
        const warns = (res.warnings || []).filter(w => w.code !== 'a11y-no-static-element-interactions');
        if (warns.length) {
            warnings += warns.length;
            for (const w of warns.slice(0, 4)) {
                console.log(`  warn  ${rel}:${w.start ? w.start.line : '?'}  ${w.code}  ${w.message}`);
            }
            if (warns.length > 4) console.log(`  warn  ${rel}  ...and ${warns.length - 4} more`);
        }
    } catch (e) {
        bad++;
        const at = e.start ? `:${e.start.line}:${e.start.column}` : '';
        console.log(`  FAIL  ${rel}${at}\n        ${e.message}`);
        if (e.frame) console.log(String(e.frame).split('\n').map(l => '        ' + l).join('\n'));
    }
}

console.log('');
console.log(`  ${files.length} component(s) compiled, ${bad} failed, ${warnings} warning(s).`);
process.exit(bad ? 1 : 0);
