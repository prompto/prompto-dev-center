import Mirror from '../ace/Mirror';
import Repository from '../code/Repository';
import Defaults from '../code/Defaults';

export default class PromptoWorker extends Mirror {

    constructor(sender) {
        super(sender);
        this.$projectId = null;
        this.$project = null;
        this.$dialect = Defaults.dialect;
        this.$value = this.doc.getValue();
        this.$core = false;
        this.$repo = new Repository();
        this.$loading = {};
        this.$authorization = null;
        this.onInit();
    }

    onInit() {
        this.markLoading("Project");
        // fake 'library' to ensure libraries are published only once dependencies are loaded
        this.markLoading("%Description%");
        // load core
        this.markLoading("Core");
        this.loadText("../prompto/prompto.pec", text => {
            this.$repo.registerLibraryCode(text, "E");
            this.markLoaded("Core");
        });
    }

    onUpdate() {
        var value = this.doc.getValue();
        var errorListener = new AnnotatingErrorListener();
        if(value === this.$value && !this.$selectedContent)
            this.$repo.handleSetContent(value, this.$dialect, errorListener);
        else {
            const catalog = this.$repo.handleEditContent(value, this.$dialect, errorListener, this.$selectedContent);
            delete this.$selectedContent;
            if (catalog)
                this.sender.emit("catalogUpdated", catalog);
        }
        this.$value = value;
        this.sender.emit("annotate", errorListener.problems);
    }

    setDialect(dialect) {
        var old = this.$dialect;
        this.$dialect = dialect;
        if(old && dialect!==old) {
            var value = this.doc.getValue();
            if(value) {
                // remember value since it does not result from an edit
                this.$value = this.$repo.translate(value, old, dialect);
                this.sender.emit("value", this.$value);
            }
        }
    }

    setProject(projectId, loadDependencies) {
        this.$projectId = projectId;
        this.unpublishProject();
        this.loadProject(projectId, loadDependencies);
    }


    setContent(content) {
        // remember value if it does not result from an edit
        if(content.creating) {
            this.$value = "";
            this.$selectedContent = false;
            this.$core = false;
        } else if(content.name) {
            this.$value = this.$repo.getDeclarationBody(content, this.$dialect);
            this.$core = content.core || false;
        } else {
            this.$value = content.body || "";
            this.$selectedContent = (content.body || null) !== null;
            this.$core = false;
        }
        this.sender.emit("value", this.$value);
    }


    destroy(content) {
        this.$value = "";
        const catalog = this.$repo.handleDestroyed(content);
        if(catalog)
            this.sender.emit("catalogUpdated", catalog);
        this.sender.emit("value", this.$value);
    }


    loadProject(projectId, loadDependencies) {
        this.fetchModuleDescription(projectId, true, response => {
            if(response.error)
                ; // TODO something
            else {
                this.$project = response.data.value;
                if(loadDependencies && this.$project.dependencies) {
                    this.$project.dependencies.value
                        .filter(dep => dep!=null)
                        .map(dep=>this.loadDependency(dep.value || dep), this);
                }
                this.markLoaded("%Description%");
            }
        });
        this.fetchProjectDeclarations(projectId, response => {
            if(response.error)
                ; // TODO something
            else {
                const declarations = response.data.value;
                this.$repo.registerProjectDeclarations(projectId, declarations);
                this.markLoaded("Project");
            }
        });
    }

    loadDependency(dependency) {
        this.markLoading(dependency.name);
        this.fetchLibraryDeclarations(dependency.name, dependency.version, response => {
            if(response.error)
                ; // TODO something
            else {
                const declarations = response.data.value;
                this.$repo.registerLibraryDeclarations(declarations);
                this.markLoaded(dependency.name);
            }
        });
    }

    fetchModuleDescription(projectId, register, success) {
        var params = [ {name:"dbId", value:projectId.toString()}, {name:"register", type:"Boolean", value:register}];
        var url = '/ws/run/getModuleDescription?params=' + JSON.stringify(params);
        this.loadJSON(url, success);
    }

    fetchProjectDeclarations(projectId, success) {
        var params = [ {name:"dbId", value:projectId.toString()}];
        var url = '/ws/run/getModuleDeclarations?params=' + JSON.stringify(params);
        this.loadJSON(url, success);
    }


    fetchLibraryDeclarations(name, version, success) {
        var params = [ {name:"name", type:"Text", value:name}, {name:"version", type:version.type, value:version.value} ];
        var url = '/ws/run/getModuleDeclarations?params=' + JSON.stringify(params);
        this.loadJSON(url, success);
    }

    publishLibraries() {
        var catalog = this.$repo.publishLibraries();
        this.sender.emit("catalogUpdated", catalog);
    }

    publishProject() {
        var catalog = this.$repo.publishProject();
        this.sender.emit("catalogUpdated", catalog);
    }

    unpublishProject() {
        var catalog = this.$repo.unpublishProject();
        this.sender.emit("catalogUpdated", catalog);
    }

    markLoading(name) {
        this.$loading[name] = true;
    }

    markLoaded (name) {
        delete this.$loading[name];
        // is this the Project ?
        if(name==="Project")
            this.publishProject();
        // is this the last library ?
        else if (Object.keys(this.$loading).length === 1 && "Project" in this.$loading)
            this.publishLibraries();
        // is this the last loading
        else if (Object.keys(this.$loading).length === 0)
            this.publishLibraries();
    }

    loadJSON(url, success) {
        this.loadText(url, text => success(JSON.parse(text)));
    }

    loadText(url, success) {
        var worker = this;
        var xhr = new XMLHttpRequest();
        xhr.onerror = function(e) {
            self.console.log("Error " + e.target.status + " occurred while receiving the document.");
            return null;
        };
        xhr.onload = function(e) {
            if(url[0]=="/" || url[0]==".") {
                // can't read unsafe header
                worker.$authorization = xhr.getResponseHeader("X-Authorization") || null;
            }
            success(xhr.responseText);
        };
        xhr.open('GET', url);
        if(url[0]!="/" && url[0]!=".") {
            if(worker.$authorization!=null)
                xhr.setRequestHeader("X-Authorization", worker.$authorization);
            xhr.setRequestHeader("Access-Control-Allow-Origin", "*");
            xhr.withCredentials = true;
        }
        xhr.send(null);
    }

    prepareCommit() {
        const edited = this.$repo.prepareCommit();
        this.sender.emit("commitPrepared", edited);
    }

    commitFailed() {
        // keep state as is
    }

    commitSuccessful() {
        this.fetchProjectDeclarations(this.$projectId, response => {
            if (response.error)
                ; // TODO something
            else {
                const declarations = response.data.value;
                this.$repo.registerCommitted(declarations);
             }
        });
    }

    runMethod(content, mode) {
        if (mode==="LI")
            this.interpretLocally(content);
        else if(mode==="SI")
            this.runRemotely(content,"interpret");
        else // compiled
            this.runRemotely(content, "execute");
    }

    interpretLocally(content) {
        var context = this.$repo.projectContext;
        if(content.subType==="test") {
            const store = prompto.store.DataStore.instance;
            prompto.store.DataStore.instance = new prompto.memstore.MemStore();
            try {
                prompto.runtime.Interpreter.interpretTest(context, content.name);
            } finally {
                prompto.store.DataStore.instance = store;
            }
        } else  {
            prompto.runtime.Interpreter.interpret(context, content.name, "");
            console.log("Finished running " + content.name);
        }
        this.sender.emit("done");
    }

    runRemotely(content, mode) {
        this.fetchModuleURL(this.$projectId, url => {
            var fullUrl = url + "ws/run/" + content.name +  "?mode=" + mode;
            if(content.subType==="method")
                fullUrl = fullUrl + "&main=true";
            this.loadJSON(fullUrl, response => {
                if (response.error)
                    console.log(response.error);
                else if(response.data instanceof Array)
                    response.data.map(console.log);
                else
                    console.log(response.data);
                this.sender.emit("done");
            });
        });
    }

    fetchModuleURL(projectId, success) {
        var params = [ {name:"dbId", value:projectId.toString()}];
        var url = '/ws/run/getModulePort?params=' + JSON.stringify(params);
        this.loadJSON(url, response => {
            if (response.error)
                ; // TODO something
            else {
                var href = self.location.protocol +
                    "//" + self.location.hostname +
                    ":" + response.data + "/";
                success(href);
            }
        });
    }

    fetchRunnablePage(content) {
        var runnable = { valid: false, content: null };
        var decl = this.$repo.getDeclaration(content);
        if(decl!==null && decl.annotations && decl instanceof prompto.declaration.ConcreteWidgetDeclaration) {
            var annotations = decl.annotations.filter(function(a) { return a.id.name==="@PageWidgetOf" });
            if(annotations.length>0 && annotations[0].expression instanceof prompto.literal.TextLiteral)
                runnable = { valid: true, content: { type: "page", name: annotations[0].expression.value.toString() }};
        }
        this.sender.callback(runnable, arguments[1]); // callbackId is added by ACE
    }
}