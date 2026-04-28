import { snapshot } from '../state.js';
export default function stateRoute(req, res) { res.json(snapshot()); }
