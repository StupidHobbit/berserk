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

// Казагир: the Gift of Soth lights the shoulder's engraved lightning,
// charges the hooked sword, then sends a second crimson wound down its edge.
float oval(vec2 p, vec2 center, vec2 radius) {
    return 1.0-smoothstep(0.50,1.0,length((p-center)/radius));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
vec2 edge(float f) {
    if (f<0.28) return mix(vec2(0.818,0.304),vec2(0.748,0.374),f/0.28);
    if (f<0.62) return mix(vec2(0.748,0.374),vec2(0.627,0.464),(f-0.28)/0.34);
    return mix(vec2(0.627,0.464),vec2(0.493,0.554),(f-0.62)/0.38);
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    // Scan verified as 496x700 WebP. No title, class strip, three ability
    // medallions (including their counters), or bottom stat-frame pixels.
    float art=smoothstep(0.140,0.151,p.y)*(1.0-smoothstep(0.541,0.553,p.y));
    art*=smoothstep(0.009,0.024,p.x)*(1.0-smoothstep(0.977,0.992,p.x));
    art*=clamp(smoothstep(0.174,0.192,p.x)+smoothstep(0.379,0.393,p.y),0.0,1.0);
    vec3 color=scan.rgb;
    float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float phase=t*0.19+seed*0.32;
    float charge=0.5+0.5*sin(6.2831853*phase);
    float shoulder=oval(p,vec2(0.613,0.208),vec2(0.131,0.071));
    float forearm=oval(p,vec2(0.814,0.226),vec2(0.121,0.076));
    float metal=clamp(shoulder+forearm,0.0,1.0);
    float engraving=smoothstep(0.37,0.74,luma)*metal;
    float lightning=0.5+0.5*sin(p.x*27.0-p.y*24.0-t*3.1);
    color+=vec3(0.10,0.31,0.35)*engraving*(0.45+0.55*lightning);
    color+=vec3(0.025,0.065,0.080)*metal*charge;

    // The small mark on the dark breastplate stays legible even at t=0.
    // Its three spokes recall the granted 2-4-5 strike, without touching text.
    vec2 sealCenter=vec2(0.545,0.343);
    vec2 q=(p-sealCenter)*vec2(1.0,1.42);
    float radius=length(q);
    float ring=1.0-smoothstep(0.0014,0.0028+aa,abs(radius-0.029));
    float rune=0.0;
    for(int i=0;i<3;i++) {
        float angle=2.0943951*float(i)-1.5707963;
        vec2 a=vec2(cos(angle),sin(angle))*0.023;
        float d=segment(q,vec2(0.0),a);
        rune=max(rune,1.0-smoothstep(0.0008,0.0020+aa,d));
    }
    float sealGlow=exp(-radius*radius/0.0010);
    color+=vec3(0.23,0.105,0.022)*(ring*0.60+rune*0.60+sealGlow*0.20)
          *(0.65+0.35*charge);

    // Two distinct packets run from the painted hooked guard to the tip.
    // The late red packet represents the additional wound after a strong hit.
    float first=fract(phase*1.25);
    float second=fract(phase*1.25+0.59);
    float wake=0.0;
    float cut=0.0;
    float line=0.0;
    float blade=0.0;
    for(int i=0;i<24;i++) {
        float f=float(i)/24.0;
        float d=segment(p,edge(f),edge(f+1.0/24.0));
        float core=1.0-smoothstep(0.0010,0.0028+aa,d);
        float glow=exp(-d*d/0.00014);
        float moving=exp(-pow((f-first)/0.17,2.0))*sin(first*3.14159265);
        float echo=exp(-pow((f-second)/0.12,2.0))*sin(second*3.14159265);
        line=max(line,core);
        blade=max(blade,exp(-d*d/0.00080));
        wake=max(wake,(core*0.70+glow*0.55)*moving);
        cut=max(cut,(core*0.75+glow*0.40)*echo);
    }
    color+=vec3(0.11,0.21,0.24)*line*(0.55+charge*0.25);
    color+=vec3(0.28,0.48,0.47)*wake;
    color+=vec3(0.48,0.055,0.018)*cut;
    color+=vec3(0.065,0.010,0.004)*blade*(0.45+0.55*charge);
    float guard=oval(p,vec2(0.833,0.301),vec2(0.071,0.047));
    color+=vec3(0.085,0.19,0.18)*guard*smoothstep(0.35,0.69,luma)
          *(0.4+0.6*charge);

    // Wind follows the horizontal folds of the trailing red cape.
    float cape=oval(p,vec2(0.213,0.302),vec2(0.225,0.060));
    float redInk=smoothstep(0.055,0.22,scan.r-scan.b);
    float folds=pow(0.5+0.5*sin(p.y*104.0+p.x*8.0-t*1.8),4.0);
    color+=vec3(0.12,0.027,0.007)*cape*redInk*(0.25+0.75*folds);

    if(u_is_foil) {
        // The engraved pauldrons and enormous blade become polished foil.
        // Wide fixed interference bands are visible with reduced motion.
        float torso=oval(p,vec2(0.450,0.437),vec2(0.155,0.152));
        float face=oval(p,vec2(0.464,0.275),vec2(0.058,0.065));
        float finish=clamp(0.22+metal*0.64+blade*0.61+torso*0.30,0.0,0.94)
                    *(1.0-face*0.90);
        float field=p.x*2.4+p.y*2.0+sin(p.x*13.0-p.y*18.0)*0.11-t*0.11+seed*0.4;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(field+vec3(0.0,0.333,0.667)));
        vec3 coat=mix(2.0*color*spectrum,
                      1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,coat,finish*0.57);
        float sheen=pow(0.5+0.5*sin(p.x*16.0+p.y*11.0-t*1.3),8.0);
        color+=(1.0-color)*(vec3(0.035)+spectrum*0.20)*finish;
        color+=(1.0-color)*mix(vec3(0.82,0.91,1.0),spectrum,0.45)
              *sheen*finish*(0.22+0.21*smoothstep(0.2,0.72,luma));
        color+=vec3(0.08,0.16,0.14)*engraving*(0.5+sheen*0.5);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
