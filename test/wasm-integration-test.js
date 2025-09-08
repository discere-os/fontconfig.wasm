#!/usr/bin/env node
/**
 * fontconfig.wasm integration tests
 * Tests WASM-native functionality and ecosystem integration
 */

import { promises as fs } from 'fs';
import { performance } from 'perf_hooks';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

// Test configuration
const TEST_CONFIG = {
    timeout: 30000,
    maxMemoryUsage: 256 * 1024 * 1024, // 256MB
    expectedFonts: 5 // Minimum expected fonts in test environment
};

// Test results collector
const results = {
    passed: 0,
    failed: 0,
    tests: []
};

// Utility functions
const log = (msg) => console.log(`[TEST] ${msg}`);
const error = (msg) => console.error(`[ERROR] ${msg}`);
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(`Assertion failed: ${message}`);
    }
};

// Test helper to run individual test
async function runTest(name, testFn) {
    log(`Running test: ${name}`);
    const start = performance.now();
    
    try {
        await testFn();
        const duration = Math.round(performance.now() - start);
        log(`✓ ${name} (${duration}ms)`);
        results.passed++;
        results.tests.push({ name, status: 'PASSED', duration });
    } catch (err) {
        const duration = Math.round(performance.now() - start);
        error(`✗ ${name} (${duration}ms): ${err.message}`);
        results.failed++;
        results.tests.push({ name, status: 'FAILED', duration, error: err.message });
    }
}

// Load WASM module for testing
async function loadFontConfigModule(useSIMD = false) {
    const moduleName = useSIMD ? 'fontconfig-simd.js' : 'fontconfig.js';
    const modulePath = path.join(DIST_DIR, moduleName);
    
    try {
        await fs.access(modulePath);
    } catch (err) {
        throw new Error(`WASM module not found: ${modulePath}. Run ./build-wasm.sh first.`);
    }
    
    // Import the module dynamically
    const { default: FontConfigModule } = await import(modulePath);
    return await FontConfigModule();
}

// Test 1: Basic module loading
async function testModuleLoading() {
    const fc = await loadFontConfigModule();
    
    assert(typeof fc.FcInit === 'function', 'FcInit function should be available');
    assert(typeof fc.FcFini === 'function', 'FcFini function should be available');
    assert(typeof fc.FcPatternCreate === 'function', 'FcPatternCreate function should be available');
    assert(typeof fc.FS === 'object', 'File system should be available');
    
    // Initialize fontconfig
    const result = fc.FcInit();
    assert(result === 1, 'FcInit should return success');
    
    fc.FcFini();
}

// Test 2: Pattern creation and manipulation
async function testPatternManipulation() {
    const fc = await loadFontConfigModule();
    fc.FcInit();
    
    try {
        // Create pattern
        const pattern = fc.FcPatternCreate();
        assert(pattern !== 0, 'Pattern creation should return non-null pointer');
        
        // Add string property
        const result1 = fc.FcPatternAddString(pattern, 'family', 'Arial');
        assert(result1 === 1, 'Adding string property should succeed');
        
        // Add integer property
        const result2 = fc.FcPatternAddInteger(pattern, 'weight', 400);
        assert(result2 === 1, 'Adding integer property should succeed');
        
        // Retrieve string property
        const family = fc.FcPatternGetString(pattern, 'family', 0);
        assert(family === 'Arial', 'Retrieved family should match input');
        
        // Cleanup
        fc.FcPatternDestroy(pattern);
    } finally {
        fc.FcFini();
    }
}

// Test 3: Font matching functionality
async function testFontMatching() {
    const fc = await loadFontConfigModule();
    fc.FcInit();
    
    try {
        const config = fc.FcConfigGetCurrent();
        assert(config !== 0, 'Should get current configuration');
        
        // Create pattern for matching
        const pattern = fc.FcPatternCreate();
        fc.FcPatternAddString(pattern, 'family', 'serif');
        fc.FcPatternAddInteger(pattern, 'weight', 400);
        
        // Perform font matching
        const result = fc.malloc(4);
        const match = fc.FcFontMatch(config, pattern, result);
        
        if (match !== 0) {
            const matchedFamily = fc.FcPatternGetString(match, 'family', 0);
            log(`Matched font family: ${matchedFamily}`);
            assert(typeof matchedFamily === 'string', 'Should get matched font family');
            
            fc.FcPatternDestroy(match);
        } else {
            log('No font match found - this may be expected in test environment');
        }
        
        fc.FcPatternDestroy(pattern);
        fc.free(result);
    } finally {
        fc.FcFini();
    }
}

// Test 4: Font listing functionality
async function testFontListing() {
    const fc = await loadFontConfigModule();
    fc.FcInit();
    
    try {
        const config = fc.FcConfigGetCurrent();
        const pattern = fc.FcPatternCreate();
        
        // List all fonts
        const fontSet = fc.FcFontList(config, pattern, 0);
        
        if (fontSet !== 0) {
            log('Font listing succeeded');
            fc.FcFontSetDestroy(fontSet);
        } else {
            log('No fonts found - this may be expected in test environment');
        }
        
        fc.FcPatternDestroy(pattern);
    } finally {
        fc.FcFini();
    }
}

// Test 5: Virtual filesystem functionality
async function testVirtualFilesystem() {
    const fc = await loadFontConfigModule();
    
    // Test filesystem access
    assert(typeof fc.FS.writeFile === 'function', 'FS.writeFile should be available');
    assert(typeof fc.FS.readFile === 'function', 'FS.readFile should be available');
    assert(typeof fc.FS.mkdir === 'function', 'FS.mkdir should be available');
    
    // Test directory creation
    try {
        fc.FS.mkdir('/test-fonts');
        log('Virtual directory creation succeeded');
    } catch (err) {
        // Directory might already exist
        log('Directory creation skipped (may already exist)');
    }
    
    // Test file operations
    const testData = 'Test font configuration data';
    fc.FS.writeFile('/test-fonts/test.conf', testData);
    
    const readData = fc.FS.readFile('/test-fonts/test.conf', { encoding: 'utf8' });
    assert(readData === testData, 'File read/write should work correctly');
    
    log('Virtual filesystem operations completed');
}

// Test 6: Memory usage and cleanup
async function testMemoryManagement() {
    const fc = await loadFontConfigModule();
    const initialHeapSize = fc.HEAPU8.length;
    
    fc.FcInit();
    
    // Create and destroy multiple patterns to test memory management
    const patterns = [];
    for (let i = 0; i < 100; i++) {
        const pattern = fc.FcPatternCreate();
        fc.FcPatternAddString(pattern, 'family', `TestFamily${i}`);
        patterns.push(pattern);
    }
    
    // Cleanup patterns
    patterns.forEach(pattern => fc.FcPatternDestroy(pattern));
    
    fc.FcFini();
    
    const finalHeapSize = fc.HEAPU8.length;
    const memoryGrowth = finalHeapSize - initialHeapSize;
    
    log(`Memory growth: ${memoryGrowth} bytes`);
    assert(memoryGrowth < TEST_CONFIG.maxMemoryUsage, 
           `Memory growth (${memoryGrowth}) should be less than ${TEST_CONFIG.maxMemoryUsage}`);
}

// Test 7: SIMD performance comparison (if available)
async function testSIMDPerformance() {
    let fcRegular, fcSIMD;
    
    try {
        fcRegular = await loadFontConfigModule(false);
        fcSIMD = await loadFontConfigModule(true);
    } catch (err) {
        log('SIMD module not available, skipping SIMD performance test');
        return;
    }
    
    const runFontOperations = async (fc, iterations = 100) => {
        fc.FcInit();
        const start = performance.now();
        
        try {
            const config = fc.FcConfigGetCurrent();
            
            for (let i = 0; i < iterations; i++) {
                const pattern = fc.FcPatternCreate();
                fc.FcPatternAddString(pattern, 'family', 'serif');
                fc.FcPatternAddInteger(pattern, 'weight', 400);
                
                const result = fc.malloc(4);
                const match = fc.FcFontMatch(config, pattern, result);
                
                if (match !== 0) {
                    fc.FcPatternDestroy(match);
                }
                
                fc.FcPatternDestroy(pattern);
                fc.free(result);
            }
        } finally {
            fc.FcFini();
        }
        
        return performance.now() - start;
    };
    
    const regularTime = await runFontOperations(fcRegular);
    const simdTime = await runFontOperations(fcSIMD);
    
    const speedup = regularTime / simdTime;
    log(`Performance comparison: Regular ${regularTime.toFixed(2)}ms vs SIMD ${simdTime.toFixed(2)}ms`);
    log(`SIMD speedup: ${speedup.toFixed(2)}x`);
    
    // SIMD should be at least as fast as regular version
    assert(simdTime <= regularTime * 1.1, 'SIMD version should not be significantly slower');
}

// Test 8: Error handling
async function testErrorHandling() {
    const fc = await loadFontConfigModule();
    fc.FcInit();
    
    try {
        // Test invalid pattern operations
        const invalidPattern = 0; // NULL pointer
        
        // These should handle invalid input gracefully
        const result1 = fc.FcPatternAddString(invalidPattern, 'family', 'test');
        const result2 = fc.FcPatternGetString(invalidPattern, 'family', 0);
        
        log('Error handling test completed (implementation-dependent results)');
    } finally {
        fc.FcFini();
    }
}

// Generate test report
function generateReport() {
    const totalTests = results.passed + results.failed;
    const successRate = totalTests > 0 ? (results.passed / totalTests * 100).toFixed(1) : 0;
    
    console.log('\n' + '='.repeat(60));
    console.log('FONTCONFIG.WASM TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${results.passed}`);
    console.log(`Failed: ${results.failed}`);
    console.log(`Success Rate: ${successRate}%`);
    console.log('');
    
    if (results.tests.length > 0) {
        console.log('Test Details:');
        results.tests.forEach(test => {
            const status = test.status === 'PASSED' ? '✓' : '✗';
            console.log(`  ${status} ${test.name} (${test.duration}ms)`);
            if (test.error) {
                console.log(`    Error: ${test.error}`);
            }
        });
    }
    
    console.log('='.repeat(60));
    
    return results.failed === 0;
}

// Main test runner
async function main() {
    log('Starting fontconfig.wasm integration tests...');
    
    try {
        // Run all tests
        await runTest('Module Loading', testModuleLoading);
        await runTest('Pattern Manipulation', testPatternManipulation);
        await runTest('Font Matching', testFontMatching);
        await runTest('Font Listing', testFontListing);
        await runTest('Virtual Filesystem', testVirtualFilesystem);
        await runTest('Memory Management', testMemoryManagement);
        await runTest('SIMD Performance', testSIMDPerformance);
        await runTest('Error Handling', testErrorHandling);
        
        const success = generateReport();
        process.exit(success ? 0 : 1);
        
    } catch (err) {
        error(`Test runner failed: ${err.message}`);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(err => {
        error(`Unhandled error: ${err.message}`);
        process.exit(1);
    });
}