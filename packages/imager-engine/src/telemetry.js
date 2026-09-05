export class TelemetryStream {
    subscribers = new Set();
    lastTelemetry = {
        overallCorrelation: 1.0,
        bandCorrelations: [1.0, 1.0, 1.0, 1.0],
        bandWidths: [0.0, 1.0, 1.0, 1.0],
        samples: [],
    };
    subscribe(callback) {
        this.subscribers.add(callback);
        // Send immediate snapshot upon subscription
        callback(this.lastTelemetry);
        return () => {
            this.subscribers.delete(callback);
        };
    }
    emit(telemetry) {
        this.lastTelemetry = telemetry;
        for (const subscriber of this.subscribers) {
            subscriber(telemetry);
        }
    }
    getSnapshot() {
        return { ...this.lastTelemetry };
    }
}
//# sourceMappingURL=telemetry.js.map