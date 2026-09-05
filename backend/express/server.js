const express = require('express');
const path = require('path');
const cors = require('cors');
const app = express();

app.use(cors());
app.use('/stems', express.static(path.join(__dirname, '..', 'audio', 'stems')));
app.use('/good-bad', express.static(path.join(__dirname, '..', 'audio', 'demos')));
app.use('/renders', express.static(path.join(__dirname, '..', 'audio', 'renders')));

// Serve actual SonoDS Plugins from PlugInEffects
const pluginEffectsDir = path.join(__dirname, '..', '..', 'PlugInEffects');
app.use('/plugins/eq', express.static(path.join(pluginEffectsDir, 'sonods-eq', 'apps', 'demo', 'dist')));
app.use('/plugins/compressor', express.static(path.join(pluginEffectsDir, 'sonods-compressor', 'apps', 'demo', 'dist')));
app.use('/plugins/saturator', express.static(path.join(pluginEffectsDir, 'sonods-saturator', 'apps', 'demo', 'dist')));
app.use('/plugins/gate', express.static(path.join(pluginEffectsDir, 'sonods-gate', 'apps', 'demo', 'dist')));

app.listen(3001, () => console.log('SONODS backend running on port 3001'));
