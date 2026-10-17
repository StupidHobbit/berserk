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

// Машинный червь: mechanical vampirism feeds the segmented charge reservoir.
// Scan coordinates are top-left, measured on the 496 x 700 illustration.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0 - smoothstep(0.48, 1.0, length((p-c)/r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 ab = b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/max(dot(ab,ab),0.000001),0.0,1.0));
}
vec2 chargePath(float q) {
    // Tail, lower bend, upright trunk, and the furnace in the head.
    return vec2(0.365+0.32*sin(q*2.30),
                0.327+0.103*sin(q*4.15)-0.038*q);
}
vec2 siphonPath(float q, float side) {
    return mix(vec2(0.705+side*0.031,0.493),vec2(0.579,0.218),q)
         + vec2(side*0.034*sin(q*3.141593),0.012*sin(q*6.283185));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/u_resolution.x,1.0/u_resolution.y);
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.137);
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.537,0.551,p.y))
             *smoothstep(0.012,0.028,p.x)*(1.0-smoothstep(0.977,0.991,p.x));
    // Preserve both printed shields, their full metal borders and shadows.
    art*=smoothstep(1.0,1.17,length((p-vec2(0.108,0.180))/vec2(0.063,0.044)));
    art*=smoothstep(1.0,1.17,length((p-vec2(0.108,0.260))/vec2(0.063,0.044)));
    vec3 color=scan.rgb;
    vec3 copper=vec3(0.95,0.48,0.08);
    vec3 current=vec3(0.20,0.78,0.61);

    // Twin narrow extraction currents visibly climb from the broken machine.
    // Three long packets per stream make the travel apparent at compact size.
    for(int j=0;j<2;j++) {
        float side=float(j)*2.0-1.0;
        float q=clamp((0.493-p.y)/0.275,0.0,1.0);
        vec2 onPath=siphonPath(q,side);
        float d=abs(p.x-onPath.x)*0.86;
        float ends=smoothstep(0.0,0.07,q)*(1.0-smoothstep(0.94,1.0,q));
        float phase=fract(q*3.0-t*0.83+float(j)*0.37+seed);
        float packet=smoothstep(0.18,0.46,phase)*(1.0-smoothstep(0.69,0.84,phase));
        float filament=1.0-smoothstep(0.0015,0.003+aa*0.7,d);
        color+=current*filament*ends*(0.07+packet*0.66);
        color+=current*exp(-d/0.012)*ends*packet*0.14;
    }

    // Discrete copper charge beads follow the curved body, including its bend.
    // Tiny backwards trails reveal direction without obscuring the painted plates.
    for(int i=0;i<8;i++) {
        float q=fract(float(i)/8.0+t*0.22+seed);
        vec2 center=chargePath(q);
        vec2 behind=chargePath(max(q-0.050,0.0));
        float fade=smoothstep(0.0,0.07,q)*(1.0-smoothstep(0.94,1.0,q));
        float d=length((p-center)*vec2(1.0,1.42));
        float bead=1.0-smoothstep(0.0030,0.0065+aa*0.55,d);
        float trail=1.0-smoothstep(0.001,0.0025+aa*0.55,lineDistance(p,center,behind));
        color+=copper*fade*(bead*0.72+trail*0.28+exp(-d/0.017)*0.15);
    }

    // Furnace sparks spit forward out of the mouth and fall into the ravine.
    for(int i=0;i<9;i++) {
        float n=float(i);
        float q=fract(t*(0.47+0.025*mod(n,3.0))+n/9.0+seed);
        float angle=-0.60+n*0.16;
        vec2 velocity=vec2(-0.12*cos(angle),0.065*sin(angle));
        vec2 center=vec2(0.545,0.219)+velocity*q+vec2(0.0,0.045*q*q);
        vec2 tail=center-velocity*0.080-vec2(0.0,0.006*q);
        float d=lineDistance(p,center,tail);
        float spark=1.0-smoothstep(0.0008,0.0022+aa*0.65,d);
        float fade=sin(q*3.141593);
        color+=vec3(1.0,0.55,0.10)*spark*fade*0.78;
    }
    float furnace=oval(p,vec2(0.580,0.205),vec2(0.046,0.032));
    float pulse=0.5+0.5*sin(t*4.1+seed*6.283185);
    color+=vec3(0.32,0.19,0.014)*furnace*(0.25+0.75*pulse);
    float eye=oval(p,vec2(0.667,0.195),vec2(0.014,0.011));
    color+=vec3(0.30,0.41,0.025)*eye*(0.5+0.5*pulse);

    // A moving wake under the levitating body echoes its charge-powered travel.
    vec2 ring=(p-vec2(0.539,0.413))/vec2(0.210,0.044);
    float theta=atan(ring.y,ring.x);
    float ringD=abs(length(ring)-1.0)*0.044;
    float wake=(1.0-smoothstep(0.001,0.002+aa*0.6,ringD))
              *smoothstep(-0.10,0.40,ring.y);
    float dash=pow(0.5+0.5*cos(theta*5.0-t*4.0+seed*6.28),5.0);
    color+=current*wake*dash*0.46;

    if(u_is_foil) {
        float armor=max(oval(p,vec2(0.615,0.252),vec2(0.160,0.110)),
                        oval(p,vec2(0.493,0.360),vec2(0.200,0.090)));
        float metalPhase=p.x*2.7+p.y*3.1+sin(p.y*29.0+p.x*12.0)*0.13-t*0.12+seed;
        vec3 spectrum=0.5+0.5*cos(6.283185*(metalPhase+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*spectrum,
                         1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,overlay,0.20+0.39*armor);
        // Broad prismatic bevels stay visibly metallic with animation disabled.
        float bands=pow(0.5+0.5*sin(p.x*37.0+p.y*47.0-t*1.15),10.0);
        float ink=smoothstep(0.12,0.48,dot(scan.rgb,vec3(0.2126,0.7152,0.0722)));
        color+=(1.0-color)*(vec3(0.15,0.12,0.055)+spectrum*0.27)*bands*armor*ink;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
