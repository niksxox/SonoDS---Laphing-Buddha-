import { PROCESSOR_CODE } from './processor.js';
const BaseNode = typeof AudioWorkletNode !== 'undefined'
    ? AudioWorkletNode
    : class {
        constructor(_context, _name, _options) { }
    };
export class SonodsImagerNode extends BaseNode {
    telemetryCallbacks = new Set();
    port = this.port || { postMessage: () => { } };
    static async create(context, wasmBytes) {
        const blob = new Blob([PROCESSOR_CODE], { type: 'application/javascript' });
        const url = URL.createObjectURL(blob);
        await context.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        const node = new SonodsImagerNode(context);
        if (wasmBytes) {
            node.port.postMessage({ type: 'INIT_WASM', wasmBytes });
        }
        return node;
    }
    constructor(context) {
        super(context, 'sonods-imager-processor', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        });
        if (this.port) {
            this.port.onmessage = (event) => {
                const data = event.data;
                if (data.type === 'TELEMETRY') {
                    const telemetry = data.telemetry;
                    for (const cb of this.telemetryCallbacks) {
                        cb(telemetry);
                    }
                }
            };
        }
    }
    setNumBands(numBands) {
        this.port.postMessage({ type: 'PARAM', name: 'numBands', value: numBands });
    }
    setCrossovers(f1, f2, f3) {
        this.port.postMessage({ type: 'PARAM', name: 'crossovers', value: [f1, f2, f3] });
    }
    setBandWidth(band, width) {
        this.port.postMessage({ type: 'PARAM', name: 'bandWidth', band, value: width });
    }
    setStereoize(mode, amount) {
        const modeInt = mode === 'mode_i' ? 1 : mode === 'mode_ii' ? 2 : 0;
        this.port.postMessage({ type: 'PARAM', name: 'stereoize', mode: modeInt, amount });
    }
    setAsymmetry(asymmetry) {
        this.port.postMessage({ type: 'PARAM', name: 'asymmetry', value: asymmetry });
    }
    setRecoverSides(amount) {
        this.port.postMessage({ type: 'PARAM', name: 'recoverSides', value: amount });
    }
    onTelemetry(callback) {
        this.telemetryCallbacks.add(callback);
        return () => {
            this.telemetryCallbacks.delete(callback);
        };
    }
}
//# sourceMappingURL=node.js.map