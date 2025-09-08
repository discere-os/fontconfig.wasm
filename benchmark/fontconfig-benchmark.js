#!/usr/bin/env node
/**
 * fontconfig.wasm performance benchmarks
 * Measures SIMD vs fallback performance and ecosystem integration
 */

import { promises as fs } from 'fs';
import { performance } from 'perf_hooks';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Benchmark configuration
const BENCHMARK_CONFIG = {
    warmupIterations: 10,
    benchmarkIterations: 100,
    fontPatterns: [
        { family: 'serif', weight: 400, style: 'normal' },
        { family: 'sans-serif', weight: 700, style: 'normal' },
        { family: 'monospace', weight: 400, style: 'italic' },
        { family: 'fantasy', weight: 600, style: 'normal' },
        { family: 'cursive', weight: 300, style: 'oblique' }
    ]
};

// Benchmark results collector
const results = {
    system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        timestamp: new Date().toISOString()
    },
    benchmarks: {}
};

// Utility functions
const log = (msg) => console.log(`[BENCHMARK] ${msg}`);
const formatTime = (ms) => `${ms.toFixed(2)}ms`;
const formatThroughput = (ops, time) => `${(ops / (time / 1000)).toFixed(0)} ops/sec`;

// Load WASM module
async function loadFontConfigModule(useSIMD = false) {
    const moduleName = useSIMD ? 'fontconfig-simd.js' : 'fontconfig.js';
    const modulePath = path.join(DIST_DIR, moduleName);
    
    try {
        await fs.access(modulePath);
        const { default: FontConfigModule } = await import(modulePath);
        return await FontConfigModule();
    } catch (err) {
        throw new Error(`WASM module not found: ${modulePath}`);
    }
}

// Benchmark: Font pattern creation and destruction
async function benchmarkPatternOperations(fc, iterations) {
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
        const pattern = fc.FcPatternCreate();
        fc.FcPatternAddString(pattern, 'family', 'Arial');
        fc.FcPatternAddInteger(pattern, 'weight', 400);
        fc.FcPatternAddString(pattern, 'style', 'normal');
        fc.FcPatternDestroy(pattern);
    }
    
    return performance.now() - start;
}

// Benchmark: Font matching operations
async function benchmarkFontMatching(fc, iterations) {
    const config = fc.FcConfigGetCurrent();
    const patterns = BENCHMARK_CONFIG.fontPatterns;
    
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
        const patternIndex = i % patterns.length;
        const patternSpec = patterns[patternIndex];
        
        const pattern = fc.FcPatternCreate();
        fc.FcPatternAddString(pattern, 'family', patternSpec.family);
        fc.FcPatternAddInteger(pattern, 'weight', patternSpec.weight);
        fc.FcPatternAddString(pattern, 'style', patternSpec.style);
        
        const result = fc.malloc(4);
        const match = fc.FcFontMatch(config, pattern, result);
        
        if (match !== 0) {
            fc.FcPatternDestroy(match);
        }
        
        fc.FcPatternDestroy(pattern);
        fc.free(result);
    }
    
    return performance.now() - start;
}

// Benchmark: Font listing operations
async function benchmarkFontListing(fc, iterations) {
    const config = fc.FcConfigGetCurrent();
    
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
        const pattern = fc.FcPatternCreate();
        // Add some filtering criteria
        if (i % 2 === 0) {
            fc.FcPatternAddString(pattern, 'family', 'serif');
        }
        
        const fontSet = fc.FcFontList(config, pattern, 0);
        
        if (fontSet !== 0) {
            fc.FcFontSetDestroy(fontSet);
        }
        
        fc.FcPatternDestroy(pattern);
    }
    
    return performance.now() - start;
}

// Benchmark: String operations (pattern property access)
async function benchmarkStringOperations(fc, iterations) {
    const pattern = fc.FcPatternCreate();
    fc.FcPatternAddString(pattern, 'family', 'TestFont');
    fc.FcPatternAddString(pattern, 'style', 'normal');
    fc.FcPatternAddInteger(pattern, 'weight', 400);
    
    const start = performance.now();
    
    for (let i = 0; i < iterations; i++) {
        const family = fc.FcPatternGetString(pattern, 'family', 0);
        const style = fc.FcPatternGetString(pattern, 'style', 0);
        // Simulate some string processing
        if (family && style) {
            const combined = family + style;
        }
    }
    
    const end = performance.now();
    fc.FcPatternDestroy(pattern);
    
    return end - start;
}

// Benchmark: Memory allocation patterns
async function benchmarkMemoryOperations(fc, iterations) {
    const start = performance.now();
    
    const pointers = [];
    
    // Allocation phase
    for (let i = 0; i < iterations; i++) {
        const size = 64 + (i % 256); // Variable sizes 64-320 bytes
        const ptr = fc.malloc(size);
        pointers.push(ptr);
    }
    
    // Deallocation phase
    for (const ptr of pointers) {
        fc.free(ptr);
    }
    
    return performance.now() - start;
}

// Run single benchmark with warmup
async function runBenchmark(name, benchmarkFn, fc, warmup = true) {
    log(`Running benchmark: ${name}`);
    
    if (warmup) {
        // Warmup phase
        for (let i = 0; i < BENCHMARK_CONFIG.warmupIterations; i++) {
            await benchmarkFn(fc, 10);
        }
    }
    
    // Actual benchmark
    const times = [];
    const iterations = BENCHMARK_CONFIG.benchmarkIterations;
    
    for (let i = 0; i < 5; i++) { // Run 5 times and take average
        const time = await benchmarkFn(fc, iterations);
        times.push(time);
    }
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    
    return {
        iterations,
        avgTime,
        minTime,
        maxTime,
        throughput: iterations / (avgTime / 1000)
    };
}

// Compare SIMD vs regular performance
async function comparePerformance(benchmarkName, benchmarkFn) {
    let fcRegular, fcSIMD;
    
    try {
        fcRegular = await loadFontConfigModule(false);
        fcSIMD = await loadFontConfigModule(true);
    } catch (err) {
        log(`Skipping SIMD comparison for ${benchmarkName}: ${err.message}`);
        return null;
    }
    
    // Initialize both modules
    fcRegular.FcInit();
    fcSIMD.FcInit();
    
    try {
        const regularResults = await runBenchmark(`${benchmarkName} (Regular)`, benchmarkFn, fcRegular);
        const simdResults = await runBenchmark(`${benchmarkName} (SIMD)`, benchmarkFn, fcSIMD);
        
        const speedup = regularResults.avgTime / simdResults.avgTime;
        
        return {
            regular: regularResults,
            simd: simdResults,
            speedup
        };
    } finally {
        fcRegular.FcFini();
        fcSIMD.FcFini();
    }
}

// Generate performance report
function generateReport() {
    console.log('\n' + '='.repeat(80));
    console.log('FONTCONFIG.WASM PERFORMANCE BENCHMARK RESULTS');
    console.log('='.repeat(80));
    
    // System information
    console.log('System Information:');
    console.log(`  Platform: ${results.system.platform}`);
    console.log(`  Architecture: ${results.system.arch}`);
    console.log(`  Node.js: ${results.system.nodeVersion}`);
    console.log(`  Timestamp: ${results.system.timestamp}`);
    console.log('');
    
    // Benchmark results
    Object.entries(results.benchmarks).forEach(([benchmarkName, result]) => {
        if (!result) return;
        
        console.log(`${benchmarkName}:`);
        
        if (result.speedup !== undefined) {
            // SIMD vs Regular comparison
            console.log('  Regular Implementation:');
            console.log(`    Average Time: ${formatTime(result.regular.avgTime)}`);
            console.log(`    Throughput: ${formatThroughput(result.regular.iterations, result.regular.avgTime)}`);
            
            console.log('  SIMD Implementation:');
            console.log(`    Average Time: ${formatTime(result.simd.avgTime)}`);
            console.log(`    Throughput: ${formatThroughput(result.simd.iterations, result.simd.avgTime)}`);
            
            const speedupText = result.speedup > 1 ? 
                `${result.speedup.toFixed(2)}x faster` : 
                `${(1/result.speedup).toFixed(2)}x slower`;
            console.log(`    SIMD Speedup: ${speedupText}`);
        } else {
            // Single implementation result
            console.log(`  Average Time: ${formatTime(result.avgTime)}`);
            console.log(`  Min Time: ${formatTime(result.minTime)}`);
            console.log(`  Max Time: ${formatTime(result.maxTime)}`);
            console.log(`  Throughput: ${formatThroughput(result.iterations, result.avgTime)}`);
        }
        
        console.log('');
    });
    
    console.log('='.repeat(80));
}

// Generate GitHub Actions summary
function generateGitHubSummary() {
    if (!process.env.GITHUB_ACTIONS) return;
    
    console.log('\n## 📊 FontConfig.wasm Performance Benchmarks\n');
    
    Object.entries(results.benchmarks).forEach(([benchmarkName, result]) => {
        if (!result) return;
        
        console.log(`### ${benchmarkName}\n`);
        
        if (result.speedup !== undefined) {
            const speedupEmoji = result.speedup > 1.5 ? '🚀' : result.speedup > 1.1 ? '⚡' : '🔄';
            console.log(`| Implementation | Time | Throughput | Speedup |`);
            console.log(`|---|---|---|---|`);
            console.log(`| Regular | ${formatTime(result.regular.avgTime)} | ${formatThroughput(result.regular.iterations, result.regular.avgTime)} | 1.0x |`);
            console.log(`| SIMD | ${formatTime(result.simd.avgTime)} | ${formatThroughput(result.simd.iterations, result.simd.avgTime)} | ${result.speedup.toFixed(2)}x ${speedupEmoji} |`);
        } else {
            console.log(`| Metric | Value |`);
            console.log(`|---|---|`);
            console.log(`| Average Time | ${formatTime(result.avgTime)} |`);
            console.log(`| Throughput | ${formatThroughput(result.iterations, result.avgTime)} |`);
        }
        
        console.log('');
    });
}

// Main benchmark runner
async function main() {
    log('Starting fontconfig.wasm performance benchmarks...');
    
    try {
        // Font pattern operations
        results.benchmarks['Pattern Operations'] = await comparePerformance(
            'Pattern Operations', 
            benchmarkPatternOperations
        );
        
        // Font matching operations
        results.benchmarks['Font Matching'] = await comparePerformance(
            'Font Matching', 
            benchmarkFontMatching
        );
        
        // Font listing operations  
        results.benchmarks['Font Listing'] = await comparePerformance(
            'Font Listing', 
            benchmarkFontListing
        );
        
        // String operations
        results.benchmarks['String Operations'] = await comparePerformance(
            'String Operations', 
            benchmarkStringOperations
        );
        
        // Memory operations
        results.benchmarks['Memory Operations'] = await comparePerformance(
            'Memory Operations', 
            benchmarkMemoryOperations
        );
        
        generateReport();
        generateGitHubSummary();
        
        log('Benchmarks completed successfully!');
        
    } catch (err) {
        console.error(`Benchmark failed: ${err.message}`);
        process.exit(1);
    }
}

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        console.error(`Unhandled error: ${err.message}`);
        process.exit(1);
    });
}

export { main as runBenchmarks };