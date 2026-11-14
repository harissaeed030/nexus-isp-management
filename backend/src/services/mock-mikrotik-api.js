// Deterministic test adapter. Never registered as a live data provider.
export class MockMikroTikApi {
 constructor(fixtures={}){this.fixtures=fixtures;this.connected=false;this.calls=[];}
 async connect(){this.connected=true;return this;}
 async test(){if(!this.connected)await this.connect();return {identity:"MOCK-ROUTER",version:"mock",board:"mock",source:"mock"};}
 async command(path,params={}){if(!this.connected)throw new Error("Mock adapter is not connected");this.calls.push({path,params});if(!path.startsWith("/ppp/")&&!path.startsWith("/system/"))throw new Error("Unsupported mock command");return this.fixtures[path]||[];}
 close(){this.connected=false;}
}
