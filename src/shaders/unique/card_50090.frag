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

// Нересса: nightmare magic drips from her open palm. Two bright charges
// dissolve into curling dream trails while her carved staff gathers light.
// All anchors belong to the BASE 496 x 700 artwork, in top-left coordinates.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
vec2 dream(float f, float side, float t) {
    float bend=sin(f*7.4+side*2.3+t*0.55)*sin(f*3.14159265);
    return vec2(0.106+side*0.018+bend*0.052,
                0.313+f*0.205);
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    // The upper class strip and lower stat ornaments are outside this mask.
    float art=smoothstep(0.139,0.153,p.y)*(1.0-smoothstep(0.542,0.554,p.y));
    art*=smoothstep(0.009,0.025,p.x)*(1.0-smoothstep(0.975,0.991,p.x));
    // Protect both printed defense badges, including their gold outer rims.
    art*=smoothstep(0.054,0.066,length((p-vec2(0.109,0.180))*vec2(1.0,1.4113)));
    art*=smoothstep(0.054,0.066,length((p-vec2(0.109,0.260))*vec2(1.0,1.4113)));
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float face=oval(p,vec2(0.488,0.254),vec2(0.067,0.063));
    float skin=oval(p,vec2(0.531,0.306),vec2(0.103,0.089))
              +oval(p,vec2(0.518,0.466),vec2(0.056,0.081));
    float pulse=0.5+0.5*sin(t*1.65+seed);

    // Charge wells are fixed on the carved white staff head and the palm.
    vec2 crown=vec2(0.773,0.165);
    vec2 palm=vec2(0.106,0.309);
    float head=oval(p,crown,vec2(0.058,0.067));
    float hand=oval(p,palm,vec2(0.059,0.029));
    float staffInk=smoothstep(0.28,0.76,lum)*head;
    color+=(1.0-color)*vec3(0.25,0.56,0.32)*head*(0.30+pulse*0.42);
    color+=vec3(0.20,0.29,0.12)*staffInk*(0.30+0.45*pulse);
    color+=(1.0-color)*vec3(0.26,0.52,0.30)*hand*(0.45+0.40*pulse);

    // Two continuous descending trails carry the two-point discharge.
    // They follow the painted falling sparks through the open left sky.
    float threads=0.0;
    float haze=0.0;
    for (int i=0;i<24;i++) {
        float k=float(i);
        float side=step(12.0,k);
        float f=mod(k,12.0)/12.0;
        vec2 a=dream(f,side,t+seed);
        vec2 b=dream(f+1.0/12.0,side,t+seed);
        float d=segment(p,a,b);
        float fade=1.0-smoothstep(0.66,1.0,f);
        float flow=0.45+0.55*pow(0.5+0.5*sin(f*16.0-t*2.7+side*2.0),3.0);
        threads=max(threads,(1.0-smoothstep(0.0008,0.0025+aa,d))*fade*flow);
        haze=max(haze,exp(-d*d/0.00019)*fade*flow);
    }
    color+=vec3(0.28,0.48,0.30)*threads*0.70;
    color+=(1.0-color)*vec3(0.13,0.27,0.23)*haze*0.55;

    float motes=0.0;
    for (int i=0;i<5;i++) {
        float k=float(i);
        float f=fract(t*0.145+k*0.20+seed*0.07);
        vec2 pos=dream(f,mod(k,2.0),t+seed);
        vec2 d=(p-pos)*vec2(1.0,1.4113);
        float envelope=sin(f*3.14159265);
        float core=1.0-smoothstep(0.0013,0.004+aa,length(d));
        float rays=exp(-abs(d.x)/0.0018-abs(d.y)/0.015)
                  +exp(-abs(d.x)/0.011-abs(d.y)/0.002);
        motes+=(core+rays*0.32)*envelope*(i<2?1.0:0.50);
    }
    color+=vec3(0.57,0.67,0.38)*motes;

    // Existing purple clouds breathe as the nightmare spreads under her hand.
    float clouds=oval(p,vec2(0.128,0.445),vec2(0.132,0.119));
    float violet=smoothstep(0.02,0.16,scan.b-scan.g);
    float dreamWave=0.5+0.5*sin(p.y*45.0+p.x*23.0-t*1.2+seed);
    color+=vec3(0.071,0.018,0.12)*clouds*violet*dreamWave;
    // The ribbon beside the staff responds to the same slow magical pulse.
    float ribbon=oval(p,vec2(0.844,0.341),vec2(0.096,0.135));
    float green=smoothstep(0.018,0.14,scan.g-scan.r)*smoothstep(0.08,0.42,lum);
    color+=vec3(0.06,0.14,0.075)*green*ribbon*(0.35+0.65*pulse);

    if (u_is_foil) {
        // Embossed silk and carved staff retain a broad pearlescent finish
        // at frozen time. Interference follows the folds, clear at list size.
        float cloth=oval(p,vec2(0.475,0.418),vec2(0.386,0.185));
        float finish=clamp(0.25+cloth*0.50+green*0.24+head*0.22,0.0,0.90);
        finish*=1.0-clamp(face*0.88+skin*0.70,0.0,0.90);
        float folds=p.x*1.9+p.y*2.8+0.13*sin(p.x*19.0+p.y*13.0);
        float phase=folds+t*0.095+seed*0.06;
        vec3 pearl=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        vec3 coated=mix(2.0*color*pearl,
                        1.0-2.0*(1.0-color)*(1.0-pearl),step(vec3(0.5),color));
        color=mix(color,coated,finish*0.49);
        float sheen=pow(0.5+0.5*sin(folds*9.0-t*1.2),6.0);
        color+=(1.0-color)*(vec3(0.035,0.052,0.045)+pearl*0.17)*finish;
        color+=(1.0-color)*mix(vec3(0.78,0.95,0.65),pearl,0.48)
              *sheen*finish*(0.24+0.16*green);
        color+=vec3(0.12,0.19,0.11)*staffInk*(0.45+0.55*sheen);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
