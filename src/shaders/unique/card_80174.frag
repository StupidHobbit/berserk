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

// Легион: furnace ribs feed the sword; the distant demon phases through
// rising ash. Coordinates are landmarks of this card's illustration.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
float lineDist(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.537,0.557,p.y));
    art*=smoothstep(0.010,0.026,p.x)*(1.0-smoothstep(0.974,0.992,p.x));
    art*=smoothstep(1.0,1.17,length((p-vec2(0.108,0.181))/vec2(0.060,0.043)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float warm=smoothstep(0.045,0.27,scan.r-scan.b)*smoothstep(0.23,0.67,scan.r);
    float chest=oval(p,vec2(0.640,0.456),vec2(0.151,0.105));
    float throat=oval(p,vec2(0.622,0.317),vec2(0.108,0.078));
    float heartbeat=pow(0.5+0.5*sin(t*2.0+seed),3.0);
    float flow=0.5+0.5*sin(p.y*72.0+t*4.0+sin(p.x*39.0)*1.6+seed);
    // Light follows the already painted molten ribs and open throat.
    float furnace=(chest+throat*0.80)*warm;
    color*=1.0-furnace*0.11*(1.0-heartbeat);
    color+=(1.0-color)*vec3(1.0,0.34,0.035)*furnace*(0.14+0.70*heartbeat+0.22*flow);
    float eyes=oval(p,vec2(0.555,0.230),vec2(0.016,0.012))
              +oval(p,vec2(0.628,0.218),vec2(0.016,0.010));
    color+=vec3(1.0,0.31,0.045)*eyes*(0.28+0.62*heartbeat);

    // Sword flame is rooted at the hilt, flowing toward its upper-left tip.
    vec2 hilt=vec2(0.222,0.402);
    vec2 tip=vec2(0.024,0.124);
    vec2 blade=tip-hilt;
    float along=clamp(dot(p-hilt,blade)/dot(blade,blade),0.0,1.0);
    vec2 normal=normalize(vec2(-blade.y,blade.x));
    float lateral=dot(p-hilt,normal);
    float bladeGate=smoothstep(0.03,0.11,along)*(1.0-smoothstep(0.94,1.0,along));
    float wavering=0.007*sin(along*24.0-t*5.4+seed)
                  +0.004*sin(along*47.0-t*7.2);
    float flame=exp(-pow((lateral-wavering)/(0.013+0.010*sin(along*3.14159)),2.0))*bladeGate;
    float tongues=0.5+0.5*sin(along*39.0-t*6.5+seed);
    color+=(1.0-color)*vec3(1.0,0.48,0.075)*flame*(0.28+0.48*tongues);
    float edge=1.0-smoothstep(0.001,0.003+aa,abs(lateral-wavering*0.6));
    color+=vec3(0.54,0.23,0.055)*edge*bladeGate*(0.25+0.45*tongues);

    // Teleportation manifests around the small background legionnaire:
    // staggered vertical cinders expose a cool second outline in the mist.
    float ghost=oval(p,vec2(0.270,0.328),vec2(0.110,0.101));
    float vanish=0.5+0.5*sin(t*1.15+seed+1.4);
    float scanline=pow(0.5+0.5*sin(p.y*143.0+t*3.4),6.0);
    float silhouette=smoothstep(0.10,0.42,scan.b-scan.r*0.6);
    color=mix(color,color*vec3(0.69,0.92,1.12),ghost*vanish*0.32);
    color+=vec3(0.055,0.22,0.29)*ghost*scanline*vanish*silhouette;
    float ash=0.0;
    float ember=0.0;
    for (int i=0;i<22;i++) {
        float k=float(i);
        float rnd=fract(sin(k*21.71+seed)*437.13);
        float age=fract(t*(0.13+0.06*rnd)+k*0.618+seed*0.1);
        vec2 c;
        if (i<9) {
            c=vec2(0.185+0.180*rnd,0.438-age*0.206);
            c.x+=0.008*sin(age*11.0+k);
            float d=lineDist(p*vec2(1.0,1.4113),c*vec2(1.0,1.4113),
                             (c+vec2(0.0,0.006+0.011*rnd))*vec2(1.0,1.4113));
            ash+=(1.0-smoothstep(0.0007,0.0017+aa,d))*sin(age*3.14159)*vanish;
        } else {
            // Bloodthirst: sparks erupt from the hot ribs and curl left
            // toward the burning weapon instead of drifting over the UI.
            c=mix(vec2(0.635,0.451),vec2(0.205,0.320),age);
            c.y-=sin(age*3.14159)*(0.035+0.035*rnd);
            c+=vec2(sin(k*5.3),cos(k*3.1))*0.019*age;
            float d=length((p-c)*vec2(1.0,1.4113));
            ember+=(1.0-smoothstep(0.0008,0.0021+aa,d))*sin(age*3.14159)
                   *(0.30+0.70*heartbeat);
        }
    }
    color+=vec3(0.11,0.42,0.53)*ash;
    color+=vec3(0.85,0.28,0.035)*ember;

    if (u_is_foil) {
        // Raised metallic horn, shoulder and rib ink catch a broad chromatic
        // specular band; etched arcs follow the rounded shoulder plate.
        float shoulder=oval(p,vec2(0.841,0.410),vec2(0.137,0.133));
        float horns=oval(p,vec2(0.622,0.179),vec2(0.210,0.070));
        float body=oval(p,vec2(0.610,0.416),vec2(0.253,0.164));
        float metal=clamp(shoulder+horns+body*0.65+flame*0.5,0.0,1.0);
        float phase=p.x*1.7-p.y*2.3-t*0.16+seed*0.09;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),8.0);
        float engraving=0.5+0.5*sin(length((p-vec2(0.837,0.405))*vec2(1.0,1.4113))*210.0);
        color*=1.0-metal*0.16;
        color+=(1.0-color)*mix(vec3(0.83,0.86,0.98),spectrum,0.67)
              *metal*(0.20+0.73*shine)*(0.82+0.18*engraving);
        color+=spectrum*metal*shine*0.09;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
