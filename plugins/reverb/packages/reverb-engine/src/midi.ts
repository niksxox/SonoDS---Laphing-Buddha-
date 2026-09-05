// SonoDS Reverb - MIDI Learn & CC Parameter Mapping
// Task 3.3: Web MIDI API integration and CC mapping.

export type MidiCcMapping = Record<number, string>; // ccNumber -> paramName

export interface MidiLearnOptions {
  onParamMapped?: (ccNumber: number, paramName: string) => void;
  onCcValueChange?: (paramName: string, normalizedValue: number) => void;
}

export class MidiLearn {
  private mappings: MidiCcMapping = {};
  private learningParam: string | null = null;
  private midiAccess: any = null;
  private options: MidiLearnOptions;

  constructor(options: MidiLearnOptions = {}) {
    this.options = options;
  }

  public async initialize(): Promise<boolean> {
    if (typeof navigator === 'undefined' || !(navigator as any).requestMIDIAccess) {
      return false;
    }

    try {
      this.midiAccess = await (navigator as any).requestMIDIAccess();
      this.bindMidiInputs();
      return true;
    } catch {
      return false;
    }
  }

  private bindMidiInputs() {
    if (!this.midiAccess) return;

    for (const input of this.midiAccess.inputs.values()) {
      input.onmidimessage = (event: any) => this.handleMidiMessage(event);
    }

    this.midiAccess.onstatechange = () => {
      for (const input of this.midiAccess.inputs.values()) {
        input.onmidimessage = (event: any) => this.handleMidiMessage(event);
      }
    };
  }

  public startLearn(paramName: string) {
    this.learningParam = paramName;
  }

  public stopLearn() {
    this.learningParam = null;
  }

  public isLearning(): boolean {
    return this.learningParam !== null;
  }

  public getLearningParam(): string | null {
    return this.learningParam;
  }

  public mapCc(ccNumber: number, paramName: string) {
    this.mappings[ccNumber] = paramName;
    this.options.onParamMapped?.(ccNumber, paramName);
  }

  public unmapCc(ccNumber: number) {
    delete this.mappings[ccNumber];
  }

  public getMappings(): MidiCcMapping {
    return { ...this.mappings };
  }

  private handleMidiMessage(event: any) {
    const data = event.data;
    if (!data || data.length < 3) return;

    const status = data[0] & 0xf0;
    const ccNumber = data[1];
    const value = data[2]; // 0-127

    // Control Change message (0xB0)
    if (status === 0xb0) {
      const normalizedValue = value / 127.0;

      if (this.learningParam) {
        const param = this.learningParam;
        this.mapCc(ccNumber, param);
        this.learningParam = null;
      }

      const boundParam = this.mappings[ccNumber];
      if (boundParam) {
        this.options.onCcValueChange?.(boundParam, normalizedValue);
      }
    }
  }
}
