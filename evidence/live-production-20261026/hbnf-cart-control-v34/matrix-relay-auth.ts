export function relayTokenAuthorized(header:string|null, token:string, relayId:string) {
 if(token.length<43||relayId!=="opal-hbnf-cart"||header===null)return false;
 const expected="Bearer "+token;if(header.length!==expected.length)return false;
 let diff=0;for(let i=0;i<header.length;i++)diff|=header.charCodeAt(i)^expected.charCodeAt(i);
 return diff===0;
}

