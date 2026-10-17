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

float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.2,1.0,length((p-c)/r));
}

// A narrow, animated current constrained to an electrode-to-body route.
float current(vec2 p,vec2 a,vec2 b,float t,float phase,float aa) {
    vec2 q=(p-a)*vec2(1.0,1.4113);
    vec2 v=(b-a)*vec2(1.0,1.4113);
    float l=length(v);
    vec2 axis=v/max(l,0.001);
    float s=dot(q,axis)/max(l,0.001);
    float side=dot(q,vec2(-axis.y,axis.x));
    float envelope=smoothstep(0.0,0.10,s)*(1.0-smoothstep(0.90,1.0,s));
    float zig=sin(s*27.0-t*8.0+phase)+0.44*sin(s*61.0+t*12.0+phase);
    float d=abs(side-zig*0.008*envelope);
    float wire=1.0-smoothstep(0.0014,0.0038+aa*0.65,d);
    float charge=pow(0.5+0.5*cos(s*7.0-t*4.5+phase),4.0);
    return envelope*(wire*(0.30+charge*0.85)+exp(-d*95.0)*charge*0.20);
}

void main() {
    vec4 original=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1171)*6.2831853;
    // The nameplate, faction/cost icons, shield badge, statistics and rules
    // are never sampled through a displacement or touched by these effects.
    float art=smoothstep(0.144,0.159,p.y)*(1.0-smoothstep(0.536,0.558,p.y));
    art*=smoothstep(0.009,0.025,p.x)*(1.0-smoothstep(0.976,0.993,p.x));
    art*=smoothstep(1.0,1.18,length((p-vec2(0.108,0.181))/vec2(0.066,0.045)));
    art*=smoothstep(1.0,1.12,length((p-vec2(0.885,0.079))/vec2(0.086,0.071)));
    if(art<=0.0) { gl_FragColor=original; return; }
    vec3 color=original.rgb;
    float face=oval(p,vec2(0.429,0.264),vec2(0.077,0.069));
    float discharge=pow(0.5+0.5*sin(t*2.1+seed),8.0);

    // The three stored charges collect at the painted laboratory electrodes,
    // then travel into the giant's reaching hand and into the chair restraints.
    float electricity=0.0;
    electricity+=current(p,vec2(0.490,0.194),vec2(0.584,0.234),t,seed,aa);
    electricity+=current(p,vec2(0.594,0.185),vec2(0.681,0.239),t,seed+2.1,aa);
    electricity+=current(p,vec2(0.653,0.207),vec2(0.741,0.226),t,seed+4.2,aa);
    electricity+=current(p,vec2(0.178,0.348),vec2(0.298,0.262),t,seed+0.8,aa);
    electricity+=current(p,vec2(0.299,0.261),vec2(0.355,0.309),t,seed+1.8,aa);
    electricity+=current(p,vec2(0.833,0.268),vec2(0.800,0.343),t,seed+3.0,aa);
    electricity+=current(p,vec2(0.800,0.343),vec2(0.730,0.424),t,seed+4.0,aa);
    electricity+=current(p,vec2(0.273,0.425),vec2(0.219,0.398),t,seed+2.5,aa);
    color+=vec3(0.035,0.68,0.73)*electricity*(0.76+0.44*discharge)*(1.0-face);

    float sparks=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        vec2 electrode=vec2(0.490+k*0.077,0.190+0.013*sin(k*2.0));
        float age=fract(t*0.42+k/3.0+seed*0.04);
        vec2 start=electrode+vec2(-0.045+0.036*sin(k*4.0),-0.047);
        vec2 pos=mix(start,electrode,age);
        pos.x+=sin(age*6.2831853+k)*0.014;
        float d=length((p-pos)*vec2(1.0,1.4113));
        float life=sin(age*3.14159265);
        sparks+=(1.0-smoothstep(0.003,0.008+aa,d))*life;
        float glow=oval(p,electrode,vec2(0.042,0.033));
        color+=vec3(0.0,0.28,0.32)*glow*(0.35+0.65*sin(t*3.1+k*2.1)*sin(t*3.1+k*2.1));
    }
    color+=vec3(0.18,0.76,0.73)*sparks;

    // The discharge spreads from the outstretched palm as short branching arcs.
    float hand=oval(p,vec2(0.743,0.246),vec2(0.103,0.068));
    float fingers=current(p,vec2(0.756,0.227),vec2(0.790,0.177),t,seed+1.4,aa)
                 +current(p,vec2(0.792,0.242),vec2(0.856,0.216),t,seed+3.1,aa)
                 +current(p,vec2(0.791,0.270),vec2(0.862,0.292),t,seed+5.1,aa);
    color+=vec3(0.06,0.68,0.66)*fingers*(0.25+discharge*1.15);
    color+=vec3(0.015,0.16,0.17)*hand*discharge;

    if(u_is_foil) {
        // Dark spectral metal makes the restraint frame, shoulders and palm
        // visibly foil even when time is frozen; skin shading remains legible.
        float body=oval(p,vec2(0.505,0.361),vec2(0.215,0.159));
        float arm=oval(p,vec2(0.685,0.281),vec2(0.160,0.075));
        float chair=oval(p,vec2(0.485,0.492),vec2(0.344,0.081));
        float metal=clamp(body+arm+chair*0.8+hand,0.0,1.0)*(1.0-face*0.85);
        float phase=p.x*1.7+p.y*2.5-t*0.17+seed*0.08;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 tint=mix(vec3(0.13,0.72,0.76),rainbow,0.64);
        float shine=pow(0.5+0.5*sin(phase*6.2831853),7.0);
        color*=1.0-0.22*metal;
        color+=(1.0-color)*tint*metal*(0.24+0.57*shine);
        vec3 overlay=mix(2.0*color*rainbow,1.0-2.0*(1.0-color)*(1.0-rainbow),step(vec3(0.5),color));
        color=mix(color,overlay,0.25*(1.0-face*0.9));
        color+=vec3(0.09,0.17,0.17)*electricity;
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(color,0.0,1.0),art),original.a);
}
