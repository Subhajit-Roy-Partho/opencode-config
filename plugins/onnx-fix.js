// Configure ONNX Runtime environment variables for opencode plugins instantly
process.env.OPENCODE_CORES = process.env.OPENCODE_CORES || "1";
process.env.ORT_NUM_THREADS = process.env.OPENCODE_CORES;
process.env.OMP_NUM_THREADS = process.env.OPENCODE_CORES;
process.env.MKL_NUM_THREADS = process.env.OPENCODE_CORES;
process.env.OPENBLAS_NUM_THREADS = process.env.OPENCODE_CORES;
process.env.ORT_LOGGING_LEVEL = "4";

export const OnnxFix = async () => {
  return {};
};

export default OnnxFix;
