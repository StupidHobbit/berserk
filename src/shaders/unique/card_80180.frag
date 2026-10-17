#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D u_card;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_seed;
uniform bool u_is_foil;
varying vec2 v_uv;

// Король Элмор: purple rot in the shield feeds the king's green sickle.
// Three patches below his insect legs release spores towards his crown.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.28,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 blade(float s) {
    // Painted lower left hook, grip, shaft, and upper right sickle.
    if (s<0.18) return mix(vec2(0.111,0.419),vec2(0.196,0.426),s/0.18);
    if (s<0.36) return mix(vec2(0.196,0.426),vec2(0.282,0.378),(s-0.18)/0.18);
    if (s<0.79) return mix(vec2(0.282,0.378),vec2(0.704,0.207),(s-0.36)/0.43);
    return mix(vec2(0.704,0.207),vec2(0.772,0.156),(s-0.79)/0.21);
}

void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.140,0.157,p.y)*(1.0-smoothstep(0.540,0.558,p.y));
    art*=smoothstep(0.014,0.032,p.x)*(1.0-smoothstep(0.969,0.990,p.x));
    art*=smoothstep(1.0,1.13,length((p-vec2(0.108,0.181))/vec2(0.065,0.044)));
    art*=smoothstep(1.0,1.13,length((p-vec2(0.108,0.261))/vec2(0.065,0.044)));
    art*=smoothstep(1.0,1.13,length((p-vec2(0.108,0.341))/vec2(0.065,0.044)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;

    // The actual violet cysts on the large left shield breathe in sequence.
    float cyst=0.0;
    float cystRim=0.0;
    for (int i=0;i<4;i++) {
        float k=float(i);
        vec2 c=vec2(0.285+0.014*sin(k*1.9),0.222+k*0.028);
        vec2 q=(p-c)/vec2(0.022,0.019);
        float d=length(q);
        float beat=0.45+0.55*pow(0.5+0.5*sin(t*2.2-k*0.9+seed),2.0);
        cyst+=(1.0-smoothstep(0.1,1.1,d))*beat;
        cystRim+=(1.0-smoothstep(0.07,0.19+aa*22.0,abs(d-0.77)))*beat;
    }
    color+=(1.0-color)*vec3(0.59,0.08,0.65)*cyst*0.56;
    color+=vec3(0.25,0.055,0.27)*cystRim*0.35;

    // Rot gathers in three low patches, then is spent as rising soul spores.
    float rot=0.0;
    float veins=0.0;
    for (int j=0;j<3;j++) {
        float k=float(j);
        vec2 c=vec2(0.285+k*0.237,0.516-0.018*sin(k*2.0));
        vec2 q=(p-c)*vec2(1.0,2.5);
        float radius=length(q);
        float angle=atan(q.y,q.x);
        float beat=0.5+0.5*sin(t*1.4+seed-k*1.7);
        float edge=0.047+0.006*sin(angle*5.0+seed+k);
        float patch=1.0-smoothstep(0.026,0.067,radius);
        rot+=patch*(0.25+0.75*beat);
        veins+=(1.0-smoothstep(0.001,0.003+aa,abs(radius-edge)))
              *(0.3+0.7*beat)*(0.55+0.45*sin(angle*7.0+t));
    }
    color*=1.0-rot*0.17;
    color+=(1.0-color)*vec3(0.27,0.47,0.035)*rot*0.35;
    color+=vec3(0.25,0.39,0.05)*veins*0.62;
    float spores=0.0;
    for (int j=0;j<15;j++) {
        float k=float(j);
        float phase=fract(k*0.618+t*0.12+seed*0.05);
        float side=mod(k,3.0);
        vec2 origin=vec2(0.285+side*0.237,0.509-0.018*sin(side*2.0));
        vec2 c=mix(origin,vec2(0.595,0.233),phase);
        c.x+=sin(phase*11.0+k*2.3)*0.022*sin(phase*3.14159265);
        float d=length((p-c)*vec2(1.0,1.4113));
        float life=sin(phase*3.14159265);
        spores+=(1.0-smoothstep(0.0011,0.0032+aa,d))*life;
        spores+=exp(-d*150.0)*life*0.16;
    }
    color+=vec3(0.32,0.57,0.09)*spores*0.72;

    // A moving charge follows the existing green double sickle's silhouette.
    float weapon=0.0;
    float charge=0.0;
    for (int i=0;i<28;i++) {
        float s=float(i)/28.0;
        float d=segment(p*vec2(1.0,1.4113),blade(s)*vec2(1.0,1.4113),blade(s+1.0/28.0)*vec2(1.0,1.4113));
        float ink=smoothstep(0.015,0.15,scan.g-scan.b*0.7);
        float w=(1.0-smoothstep(0.002,0.011+aa,d))*ink;
        weapon=max(weapon,w);
        float packet=pow(0.5+0.5*cos(s*9.0-t*2.6+seed),6.0);
        charge=max(charge,w*packet);
    }
    color+=(1.0-color)*vec3(0.37,0.62,0.045)*(weapon*0.13+charge*0.45);
    float eyes=oval(p,vec2(0.581,0.242),vec2(0.009,0.004))
              +oval(p,vec2(0.609,0.239),vec2(0.009,0.004));
    color+=vec3(0.35,0.63,0.18)*eyes*(0.45+0.3*sin(t*1.4+seed));

    if (u_is_foil) {
        // A broad etched titanium finish follows shield, body and limbs;
        // chromatic specular bands stay within the illustration mask.
        float shield=oval(p,vec2(0.343,0.250),vec2(0.150,0.112));
        float body=oval(p,vec2(0.544,0.367),vec2(0.292,0.172));
        float crown=oval(p,vec2(0.597,0.253),vec2(0.124,0.083));
        float metal=clamp(shield+body+crown+weapon,0.0,1.0);
        float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        metal*=smoothstep(0.045,0.25,lum);
        float phase=p.x*2.1-p.y*4.2-t*0.19+seed*0.08;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),8.0);
        float etch=0.5+0.5*sin(p.x*182.0+p.y*127.0);
        color*=1.0-metal*(0.12+0.05*etch);
        color+=(1.0-color)*mix(vec3(0.69,0.90,0.94),spectrum,0.66)
              *metal*(0.25+shine*0.69);
        color+=spectrum*(cystRim*0.14+charge*0.22);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
