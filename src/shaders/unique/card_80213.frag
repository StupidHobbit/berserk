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
vec2 soulThread(float s) {
    // The fallen double's chest, the rogue's belt, his raised puppet hand.
    return (1.0-s)*(1.0-s)*vec2(0.790,0.500)
        +2.0*(1.0-s)*s*vec2(0.340,0.545)+s*s*vec2(0.207,0.215);
}

void main() {
    vec4 original=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.137)*6.2831853;
    float art=smoothstep(0.142,0.155,p.y)*(1.0-smoothstep(0.539,0.556,p.y));
    art*=smoothstep(0.010,0.025,p.x)*(1.0-smoothstep(0.975,0.990,p.x));
    // The printed defense badge and its frame are not part of the illustration.
    art*=smoothstep(1.0,1.16,length((p-vec2(0.108,0.181))/vec2(0.061,0.043)));
    if (art<=0.0) { gl_FragColor=original; return; }

    vec3 color=original.rgb;
    vec2 aspect=vec2(1.0,1.4113);
    vec3 silverBlue=vec3(0.30,0.77,1.0);
    vec3 brass=vec3(1.0,0.70,0.29);
    float face=oval(p,vec2(0.519,0.239),vec2(0.073,0.063));
    float armor=oval(p,vec2(0.409,0.401),vec2(0.225,0.180));
    armor=max(armor,oval(p,vec2(0.231,0.291),vec2(0.097,0.091)));
    float puppet=oval(p,vec2(0.796,0.508),vec2(0.139,0.064));
    float blueMetal=smoothstep(-0.025,0.12,original.b-original.r);
    float pulse=0.5+0.5*sin(t*2.0+seed);

    // The existing strings answer his raised fingers. Their light travels down
    // the hanging marionette controller, rather than covering the entire art.
    float cords=0.0;
    float halo=0.0;
    for (int i=0;i<3;i++) {
        float fi=float(i);
        vec2 top=vec2(0.190+fi*0.025,0.230+fi*0.006);
        vec2 bottom=vec2(0.105+fi*0.054,0.489-fi*0.047);
        float d=lineDistance(p*aspect,top*aspect,bottom*aspect);
        float travel=pow(0.5+0.5*sin(p.y*37.0-t*2.4+fi*1.8+seed),5.0);
        cords+=(1.0-smoothstep(0.0006,0.0016+aa,d))*(0.12+travel*0.58);
        halo+=exp(-d*190.0)*travel*0.11;
    }
    color+=brass*(cords+halo);

    // Two successive transfers invoke the card's twice-per-battle double:
    // a bright knot runs from the fallen puppet into the living puppeteer.
    float packet=fract(t*0.18+seed*0.07);
    float energy=0.0;
    float aura=0.0;
    for (int i=0;i<28;i++) {
        float s=float(i)/28.0;
        vec2 a=soulThread(s);
        vec2 b=soulThread(s+1.0/28.0);
        float d=lineDistance(p*aspect,a*aspect,b*aspect);
        float head=exp(-pow((s-packet)*9.0,2.0))*sin(packet*3.141593);
        float second=exp(-pow((s-fract(packet+0.5))*9.0,2.0))
            *sin(fract(packet+0.5)*3.141593);
        float wave=max(head,second*0.65);
        energy=max(energy,(1.0-smoothstep(0.0006,0.0022+aa,d))*wave);
        aura=max(aura,exp(-d*125.0)*wave);
    }
    color+=silverBlue*(energy*0.57+aura*0.19);
    color+=silverBlue*puppet*(0.025+0.10*(1.0-pulse));
    float hand=oval(p,vec2(0.204,0.210),vec2(0.032,0.046));
    color+=silverBlue*hand*(0.025+0.13*pulse);

    // A narrow spectral contour retraces the already painted armor seams.
    // Original texture coordinates remain unchanged: this is reflected light.
    float seam=lineDistance(p*aspect,vec2(0.309,0.269)*aspect,vec2(0.402,0.304)*aspect);
    seam=min(seam,lineDistance(p*aspect,vec2(0.402,0.304)*aspect,vec2(0.572,0.322)*aspect));
    seam=min(seam,lineDistance(p*aspect,vec2(0.572,0.322)*aspect,vec2(0.633,0.407)*aspect));
    seam=min(seam,lineDistance(p*aspect,vec2(0.633,0.407)*aspect,vec2(0.593,0.472)*aspect));
    float armorWave=pow(0.5+0.5*sin(p.y*30.0-t*2.0+seed),6.0);
    float edge=(1.0-smoothstep(0.0009,0.003+aa,seam));
    color+=silverBlue*edge*(0.04+0.28*armorWave);
    color+=(1.0-color)*silverBlue*armor*blueMetal*(0.035+0.14*armorWave)*(1.0-face);

    if (u_is_foil) {
        // Broad oil-slick reflections stay visible even with time fixed at zero.
        // Armor gets cold polished foil; the puppet and cords catch warm metal.
        float metal=clamp(armor*(0.55+0.45*blueMetal)+puppet*0.75,0.0,1.0);
        metal*=1.0-face;
        float phase=p.x*2.55+p.y*3.4-t*0.15+seed*0.085;
        phase+=0.065*sin(p.y*29.0+p.x*12.0);
        vec3 rainbow=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.333,0.667)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853+0.6),7.0);
        color*=1.0-metal*0.17;
        color+=(1.0-color)*mix(vec3(0.80,0.88,1.0),rainbow,0.80)
            *metal*(0.40+0.55*shine);
        float etching=0.85+0.15*sin((p.x-p.y*0.55)*145.0);
        color+=rainbow*metal*shine*0.10*etching;
        color+=mix(brass,rainbow,0.6)*cords*0.22;
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(color,0.0,1.0),art),original.a);
}
