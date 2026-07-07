/**
 * scene-worker.js — Web Worker per calcoli geometria 3D off-thread.
 */

self.onmessage = function ({ data }) {
    if (data.type === 'computeHeatmapScores') {
        const scores = computeHeatmapScores(
            data.monthScores,
            data.numVerts,
            data.gridW,
            data.positions
        );
        self.postMessage({ type: 'heatmapScores', scores }, [scores.buffer]);
    }
};

function computeHeatmapScores(monthScores, numVerts, gridW, positions) {
    const scores    = new Float32Array(numVerts);
    const baseScore = monthScores.reduce((s, v) => s + v, 0) / monthScores.length;

    for (let i = 0; i < numVerts; i++) {
        const x = positions[i * 3];
        const z = positions[i * 3 + 2];

        const distSq  = x * x + z * z;
        const radial  = Math.exp(-distSq * 0.012);

        const noise   = 0.12 * Math.sin(x * 1.3 + 0.7) * Math.cos(z * 1.1 - 0.5)
                      + 0.08 * Math.sin(x * 2.1) * Math.cos(z * 1.8);

        scores[i] = Math.max(0, Math.min(1,
            baseScore * (0.5 + 0.5 * radial) + noise
        ));
    }

    return scores;
}