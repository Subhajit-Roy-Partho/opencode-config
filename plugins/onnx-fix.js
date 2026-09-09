// Cap ONNX/BLAS thread usage so local embedding models (opencode-mem) don't
// oversubscribe shared machines. Works on any arch (amd64/arm64) via os.cpus().
//
// Override: OPENCODE_CORES=N  (e.g. OPENCODE_CORES=$(nproc) on a dedicated box)
import os from "node:os";

function pickCores() {
  const fromEnv = Number.parseInt(process.env.OPENCODE_CORES ?? "", 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return String(fromEnv);
  let cpus = 1;
  try {
    cpus = os.cpus().length || 1;
  } catch {
    cpus = 1;
  }
  // Conservative default: enough for fast local embeddings, safe on shared hosts.
  return String(Math.min(Math.max(cpus, 1), 4));
}

const cores = pickCores();
process.env.OPENCODE_CORES = cores;
process.env.ORT_NUM_THREADS = cores;
process.env.OMP_NUM_THREADS = cores;
process.env.MKL_NUM_THREADS = cores;
process.env.OPENBLAS_NUM_THREADS = cores;
process.env.ORT_LOGGING_LEVEL = "4";

export const OnnxFix = async () => {
  return {};
};

export default OnnxFix;
