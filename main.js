import { GraphEditor } from "./js/editors/graphEditor.js";
import { MarkingEditor } from "./js/editors/markingEditor.js";
import { Graph } from "./js/math/graph.js";
import { average, Hash, scale } from "./js/math/utils.js";
import { Viewport } from "./js/viewport.js";
import { World } from "./js/world.js";
import { Point } from "./js/primitives/point.js";
import { SaveWorld } from "./js/save.js";
import { OSM } from "./js/osm.js";
import { checkData } from "./js/options.js";
import { Tree } from "./js/objects/tree.js";
import { LoadingScreen } from "./js/loading.js";

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = canvas.height = window.innerHeight - 165;

class Handler {
    constructor(canvas, context) {
        this.canvas = canvas;
        this.context = context;
        this.selectionMenu = document.getElementById('markingSelection');
        this.pauseDrawn = false;
        this.lastTime = 0;

        window.addEventListener('resize', () => {
            canvas.width = canvas.height = window.innerHeight - 165;
        })

        this.#addEventListeners();
    }

    init() {
        this.createNewWorld();
        this.animate(0);
    }

    #addEventListeners() {
        document.getElementById('saveLocal').addEventListener('click', () => SaveWorld.saveWorld(this.world, this.viewport), {passive: true});
        document.getElementById('restoreLocal').addEventListener('click', () => this.restore(), {passive: true});
        document.getElementById('show').addEventListener('click', SaveWorld.showSavedMaps, {passive: true});
        document.getElementById('dispose').addEventListener('click', () => {
            const mapNumber = window.prompt('Write map number to restore: ');
            SaveWorld.disposeWorld(mapNumber);
        }, {passive: true});
        document.getElementById('clearAll').addEventListener('click', () => this.clearWorld('all'), {passive: true});
        document.getElementById('clearRoads').addEventListener('click', () => this.clearWorld('roads'), {passive: true});
        document.getElementById('clearBuildings').addEventListener('click', () => this.clearWorld('buildings'), {passive: true});
        document.getElementById('clearTrees').addEventListener('click', () => this.clearWorld('trees'), {passive: true});
        document.getElementById('mode').addEventListener('click', e => this.#changeMode(e), {passive: true});
        document.getElementById('saveFile').addEventListener('click', () => SaveWorld.saveToLocalFile(this.world, this.viewport), {passive: true})
        document.getElementById('fileInput').addEventListener('change', async e => {
            if (e.target.files.length === 0) return;
            const world = await SaveWorld.loadFromLocalFile(e);
            this.createNewWorld(world);
            e.target.value = '';
        }, {passive: true})
        osmLoad.addEventListener('click', () => checkData(this));
        document.getElementById('genRoads').addEventListener('click', () => this.world.generate());
        document.getElementById('genBuildings').addEventListener('click', () => this.generateBuildings());
        document.getElementById('genTrees').addEventListener('click', () => this.generateTrees());   
    }

    generateBuildings() {
        LoadingScreen.show();
        LoadingScreen.setComment('Initiating...');
        LoadingScreen.hideBars();
        requestIdleCallback(() => this.world.generateBuildings(), {timeout: 1000});
    }
    
    generateTrees() {
        LoadingScreen.show();
        LoadingScreen.setComment('Initiating...');
        LoadingScreen.hideBars();
        requestIdleCallback(() => this.world.generateTrees(), {timeout: 1000});
    }

    restore() {
        const mapNumber = window.prompt('Write map number to restore: ');
        const world = SaveWorld.restoreWorld(mapNumber);
        
        this.createNewWorld(world);
    }

    async loadOSM(data) {
        const { points, segments } = await OSM.getWorldInfo(data);
        
        this.graph.points = points;
        this.graph.segments = segments;

        const left = Math.min(...points.map(p => p.x));
        const right = Math.max(...points.map(p => p.x));
        const top = Math.min(...points.map(p => p.y));
        const bottom = Math.max(...points.map(p => p.y));

        const middlePoint = average({x: left, y: top}, {x: right, y: bottom});
        this.viewport.offset = scale(middlePoint, -1);
        this.world.generate();
    }
    
    createNewWorld({world, viewport}={}) {
        if (!world) {
            this.graph = new Graph([], []);
            this.world = new World(this.graph);
        } else {
            this.graph = world.graph;
            this.world = world;
        }
        this.viewport = new Viewport(this.context);
        if(viewport) {
            this.viewport.zoom = viewport.zoom;
            this.viewport.offset = Point.loadPoint(viewport.offset);     
        }
        this.graphEditor = new GraphEditor(this.viewport, this.graph);
        this.markingEditor = new MarkingEditor(this.viewport, this.world);

        const modeBtn = document.getElementById('mode');
        if(modeBtn.getAttribute('mode') === 'marking') this.#changeMode({target: modeBtn});
    }

    #changeMode(e) {
        const button = e.target;
        const mode = button.getAttribute('mode');
        switch(mode) {
            case 'graph':
                this.#enableMarkingEditor(button);
                break
            case 'marking':
                this.#enableGraphEditor(button);
            break
        }
    }

    #enableMarkingEditor(button) {
        button.setAttribute('mode', 'marking');
        button.textContent = '🖊️';
        document.getElementById('modeTip').textContent = 'Marking Mode';
        this.markingEditor.enableListeners();
        this.graphEditor.disableListeners();
        this.selectionMenu.style.display = 'block';
        if(this.oldHash !== Hash(this.graph)) {
            this.oldHash = Hash(this.graph);
            this.markingEditor.generate();
        }
    }
    
    #enableGraphEditor(button) {
        button.setAttribute('mode', 'graph');
        button.textContent = '🌐';
        document.getElementById('modeTip').textContent = 'Graph Mode';
        this.graphEditor.enableListeners();
        this.markingEditor.disableListeners();
        this.selectionMenu.style.display = 'none';
    }

    clearWorld(mode) {
        switch(mode) {
            case 'all':
                this.graph.clear();
                this.world.clearWorld();
                this.graphEditor.clear();
                this.markingEditor.clear();
                break
            case 'roads':
                this.world.roads = [];
                this.world.roadBorders = [];
                break
            case 'buildings':
                this.world.buildings = [];
                break
            case 'trees':
                this.world.trees = [];
                break
        }
    }

    drawWorld() {
        this.context.restore();
        this.viewport.reset();
        const viewPoint = scale(this.viewport.getOffset(), -1);
        this.world.draw(this.context, viewPoint);
        this.graphEditor.display();
        this.markingEditor.display(this.context);
    }

    drawPause() {
        this.context.restore();
        this.context.save();
        this.context.fillStyle = 'rgba(0, 0, 0, 0.5)';
        this.context.fillRect(0, 0, canvas.width, canvas.height);
        this.context.textBaseline = 'middle';
        this.context.textAlign = 'center';
        this.context.shadowColor = 'black';
        this.context.shadowOffsetX = 5;
        this.context.shadowOffsetY = 5;
        this.context.shadowBlur = 5;
        this.context.fillStyle = 'whitesmoke';
        this.context.font = `italic 50px Arial`;
        this.context.fillText('Paused', canvas.width*0.5, canvas.height*0.5);
        this.context.restore();
    }

    animate(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if( this.oldHash !== Hash(this.graph) && 
            this.graph.segments.length < this.world.autoGenLimit) {
            this.world.generate();
            this.oldHash = Hash(this.graph);
        }

        document.getElementById('zoom').textContent = 
            `${this.viewport.getZoomPercentage()}%`;
    
        if (document.hasFocus()) {
            this.drawWorld();
            this.world.update(deltaTime);
            if(this.pauseDrawn) this.pauseDrawn = false;
        }
        else if (!this.pauseDrawn) {
            this.drawWorld();
            this.drawPause();
            this.pauseDrawn = true;
        }
        requestAnimationFrame(time => this.animate(time));
    }
}


const handler = new Handler(canvas, ctx);

window.addEventListener('load', () => {
    handler.init();
})