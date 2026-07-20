import { runSimulation, DEFAULT_SIM_OPTIONS } from "./simulate.ts";

const seed = Number(process.argv[2] ?? DEFAULT_SIM_OPTIONS.seed);
const { report } = runSimulation({ ...DEFAULT_SIM_OPTIONS, seed });
console.log(report);
