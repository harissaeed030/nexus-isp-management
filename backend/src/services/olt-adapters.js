// HSGQ publishes management protocol families but no public G04R API schema or MIB/OID list.
// This adapter intentionally performs no network calls or configuration writes.
export class OltAdapterUnavailableError extends Error{constructor(message="Verified vendor interface details are required before live OLT access."){super(message);this.code="OLT_ADAPTER_UNAVAILABLE";}}
export class HsgqG04rAdapter{
 capabilities(){return{inventory:true,ponInventory:true,onuInventory:true,protocols:["CLI","WEB","SNMP/NMS","HSGQ Cloud"],apiSpecificationVerified:false,liveStatus:false,opticalLevels:false,alarms:false,configurationWrites:false};}
 async testConnection(){throw new OltAdapterUnavailableError("No verified HSGQ-G04R connection API/authentication specification is configured.");}
 async readPonStatus(){throw new OltAdapterUnavailableError("Requires official HSGQ MIB/OIDs or read-only CLI reference.");}
 async readOnuStatus(){throw new OltAdapterUnavailableError("Requires official HSGQ MIB/OIDs or read-only CLI reference.");}
 async readOpticalLevels(){throw new OltAdapterUnavailableError("Exact firmware optical diagnostic fields/OIDs are not verified.");}
 async readAlarms(){throw new OltAdapterUnavailableError("Alarm schema is not verified for this firmware.");}
 async configure(){throw new OltAdapterUnavailableError("Configuration writes are disabled by design.");}
}
const adapters=new Map([["HSGQ:HSGQ-G04R",()=>new HsgqG04rAdapter()]]);
export function registerOltAdapter(vendor,model,factory){if(typeof factory!=="function")throw new TypeError("Adapter factory required.");adapters.set(vendor+":"+model,factory);}
export function getOltAdapter(vendor,model){return adapters.get(vendor+":"+model)?.()||null;}
