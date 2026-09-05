import { jsx as _jsx } from "react/jsx-runtime";
import { SonodsEqNode } from '@sonods/eq-engine';
import { SonodsEq, mount } from '@sonods/eq-ui';
// 1. React Consumer Pattern
export const ReactHostApp = ({ node }) => {
    return (_jsx("div", { style: { width: '900px', height: '500px', padding: '20px' }, children: _jsx(SonodsEq, { node: node, trackName: "Host Vocal Track" }) }));
};
// 2. Non-React Imperative Consumer Pattern (Task 7.1)
export function mountVanillaHost(container, audioCtx) {
    const eqNode = new SonodsEqNode(audioCtx);
    return mount(container, eqNode, {
        trackName: 'Vanilla Host Track',
        showDevOverlay: true,
    });
}
