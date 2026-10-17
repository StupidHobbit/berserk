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
    return 1.0-smoothstep(0.35,1.0,length((p-c)/r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}

void main() {
    vec4 base=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.141,0.154,p.y)*(1.0-smoothstep(0.539,0.557,p.y));
    art*=smoothstep(0.016,0.032,p.x)*(1.0-smoothstep(0.968,0.985,p.x));
    // The shield, spiral ability badge, and printed numeral are untouched.
    art*=smoothstep(1.0,1.15,length((p-vec2(0.108,0.180))/vec2(0.065,0.046)));
    art*=smoothstep(1.0,1.13,length((p-vec2(0.108,0.261))/vec2(0.067,0.046)));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.151,0.286))/vec2(0.027,0.022)));
    if (art<=0.0) { gl_FragColor=base; return; }

    vec3 color=base.rgb;
    vec3 fire=vec3(1.0,0.48,0.10);
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    float red=smoothstep(0.09,0.30,base.r-base.g)*smoothstep(0.11,0.34,base.r-base.b);
    float flag=oval(p,vec2(0.795,0.241),vec2(0.218,0.169))*red;
    float cloak=oval(p,vec2(0.289,0.372),vec2(0.157,0.071))*red;
    // Warm and dark folds travel down the painted crimson standard and mantle.
    float fold=sin(p.x*44.0+p.y*17.0-t*2.0+seed+sin(p.y*29.0-t)*0.9);
    color*=1.0+(flag*0.22+cloak*0.12)*fold;
    color+=vec3(0.25,0.042,0.012)*flag*pow(0.5+0.5*fold,4.0);

    // Segger's mark burns into the standard above the hand holding its pole.
    // The seal stays anchored to the cloth; its outer sparks orbit the imprint.
    vec2 q=(p-vec2(0.800,0.229))*vec2(1.0,1.4113);
    float radius=length(q);
    float angle=atan(q.y,q.x);
    float breath=0.60+0.40*sin(t*1.9+seed);
    float ring=1.0-smoothstep(0.0013,0.0030+aa,abs(radius-0.063));
    float inner=1.0-smoothstep(0.0008,0.0020+aa,abs(radius-0.049));
    float d=lineDistance(q,vec2(-0.024,-0.032),vec2(0.024,0.032));
    d=min(d,lineDistance(q,vec2(0.024,-0.032),vec2(-0.024,0.032)));
    d=min(d,lineDistance(q,vec2(-0.024,-0.032),vec2(0.024,-0.032)));
    d=min(d,lineDistance(q,vec2(-0.024,0.032),vec2(0.024,0.032)));
    d=min(d,lineDistance(q,vec2(0.0,-0.040),vec2(0.0,0.040)));
    float glyph=1.0-smoothstep(0.0015,0.0030+aa,d);
    float orbit=pow(0.5+0.5*cos(angle*6.0-t*1.5+seed),12.0);
    float sparks=(1.0-smoothstep(0.0015,0.0040+aa,abs(radius-0.073)))*orbit;
    float seal=(ring+inner*0.55+glyph)*0.65;
    float glow=exp(-abs(radius-0.063)*100.0)*0.13+exp(-d*100.0)*0.10;
    float banner=oval(p,vec2(0.800,0.229),vec2(0.115,0.091));
    color+=fire*banner*((seal+glow)*(0.55+0.45*breath)+sparks*0.75);

    // Golden resolve in the lion's eyes and a rising spray from the raised fist.
    float eyes=oval(p,vec2(0.490,0.226),vec2(0.015,0.006));
    eyes+=oval(p,vec2(0.564,0.231),vec2(0.010,0.006));
    color+=vec3(1.0,0.57,0.12)*eyes*(0.30+0.40*breath);
    float fist=oval(p,vec2(0.138,0.331),vec2(0.063,0.066));
    color+=fire*fist*(0.07+0.12*breath);
    for (int i=0;i<12;i++) {
        float k=float(i);
        float phase=fract(t*0.18+k*0.083333+seed*0.04);
        float x=0.143+sin(k*13.7+seed)*0.048+sin(phase*5.0+k)*0.016;
        vec2 c=vec2(x,0.351-phase*0.157);
        vec2 delta=(p-c)*vec2(1.0,1.4113);
        float spark=1.0-smoothstep(0.0012,0.0030+aa,length(delta));
        float life=sin(phase*3.14159265);
        color+=vec3(1.0,0.64,0.22)*spark*life*0.70;
    }

    if (u_is_foil) {
        // The crimson standard is lacquered copper foil, the mane brushed gold.
        // A persistent spectral undercoat remains obvious with motion disabled.
        float mane=oval(p,vec2(0.486,0.302),vec2(0.180,0.163));
        float face=oval(p,vec2(0.523,0.259),vec2(0.080,0.058));
        float horns=oval(p,vec2(0.362,0.225),vec2(0.048,0.061));
        horns+=oval(p,vec2(0.594,0.211),vec2(0.043,0.049));
        float brass=oval(p,vec2(0.399,0.411),vec2(0.059,0.049));
        float metal=clamp(flag*0.97+cloak*0.85+mane*(1.0-face)*0.85+horns+brass,0.0,1.0);
        float phase=p.x*2.1-p.y*3.4+sin(p.y*24.0)*0.11-t*0.16+seed*0.1;
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),6.0);
        float grain=0.88+0.12*sin((p.x+p.y*0.6)*390.0);
        color*=1.0-metal*0.18;
        color+=(1.0-color)*mix(vec3(0.98,0.75,0.38),rainbow,0.79)
              *metal*(0.40+0.60*shine)*grain*(0.75+0.25*lum);
        color+=rainbow*seal*banner*0.18;
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(color,0.0,1.0),art),base.a);
}
