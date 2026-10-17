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

// Роунда: the raised palm directs a moving swarm; rot propagates through
// the painted red roots and the blue forest floor. Printed areas stay exact.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.45,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/max(dot(v,v),0.000001),0.0,1.0));
}
vec2 swarmPath(float a, float lane, float seed) {
    float angle=6.2831853*a;
    // An elliptical cloud reaches from the commanding hand into the forest.
    return vec2(0.285+0.174*cos(angle),0.300+0.116*sin(angle))
         +vec2(0.024*sin(angle*3.0+lane*11.0+seed),0.016*cos(angle*4.0+lane*7.0));
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(1.0/max(u_resolution.x,1.0),1.4113/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.145,0.158,p.y)*(1.0-smoothstep(0.535,0.553,p.y));
    art*=smoothstep(0.014,0.030,p.x)*(1.0-smoothstep(0.970,0.986,p.x));
    art*=smoothstep(1.0,1.15,length((p-vec2(0.108,0.181))/vec2(0.066,0.046)));
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 color=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float face=oval(p,vec2(0.554,0.247),vec2(0.063,0.070));
    float figure=oval(p,vec2(0.565,0.395),vec2(0.116,0.175));

    // Locally follow the scarlet roots rather than painting over the pale skin.
    float roots=smoothstep(0.015,0.105,scan.r-scan.g)*smoothstep(-0.030,0.070,scan.r-scan.b*0.88);
    roots*=1.0-max(face,figure);
    float distanceFromHand=length((p-vec2(0.383,0.246))*vec2(1.0,1.4113));
    float spread=pow(0.5+0.5*sin(distanceFromHand*54.0-t*4.7+seed),5.0);
    color*=1.0-roots*0.18*(1.0-spread);
    color+=vec3(0.57,0.045,0.13)*roots*(0.12+0.85*spread);

    // Broad turquoise rivulets crawl through the existing low forest mist.
    float floorMask=smoothstep(0.410,0.455,p.y)*(1.0-figure*0.95);
    float blue=smoothstep(0.005,0.10,scan.b-scan.r)*smoothstep(0.025,0.17,lum);
    float flow=sin(p.x*31.0+p.y*54.0+2.7*sin(p.x*12.0-p.y*15.0-t*1.1)-t*3.2);
    float veins=smoothstep(0.80,0.99,flow)*floorMask*blue;
    color+=vec3(0.025,0.34,0.39)*veins;

    // The swarm is tangible at compact width: dark bodies, green wing glints,
    // and directional trailing streaks. All motion stays inside the art mask.
    float insects=0.0;
    float trails=0.0;
    float wings=0.0;
    for (int i=0;i<26;i++) {
        float fi=float(i);
        float lane=fract(fi*0.6180339+seed*0.13);
        float a=fract(fi/26.0+t*(0.105+0.055*lane)+seed*0.03);
        vec2 c=swarmPath(a,lane,seed);
        vec2 previous=swarmPath(a-0.021,lane,seed);
        vec2 q=(p-c)*vec2(1.0,1.4113);
        float d=length(q);
        insects+=1.0-smoothstep(0.0020,0.0035+aa*0.48,d);
        float line=segment(p*vec2(1.0,1.4113),c*vec2(1.0,1.4113),previous*vec2(1.0,1.4113));
        trails+=(1.0-smoothstep(0.0010,0.0025+aa*0.55,line))*0.48;
        float flutter=0.004+0.002*sin(t*22.0+fi*4.3);
        float wing=min(length(q-vec2(flutter,-0.002)),length(q-vec2(-flutter,-0.002)));
        wings+=(1.0-smoothstep(0.0008,0.0022+aa*0.35,wing))*(0.65+0.35*lane);
    }
    float swarmMask=1.0-face;
    color*=1.0-clamp(insects*0.72*swarmMask,0.0,0.8);
    color+=vec3(0.22,0.43,0.12)*trails*swarmMask;
    color+=vec3(0.37,0.57,0.18)*wings*swarmMask;
    // Palm's accumulating power links the spell to her gesture.
    float palm=oval(p,vec2(0.383,0.248),vec2(0.032,0.028));
    color+=vec3(0.09,0.24,0.15)*palm*(0.45+0.55*sin(t*2.4+seed)*sin(t*2.4+seed));

    if (u_is_foil) {
        // An oil-dark violet/copper finish respects the scanned stone relief
        // and purple hair. It is visible even when time is frozen at zero.
        float hair=oval(p,vec2(0.616,0.300),vec2(0.076,0.112));
        float stone=blue*(1.0-figure)*smoothstep(0.22,0.32,p.y);
        float metal=clamp(0.48*stone+0.78*hair+0.75*roots,0.0,1.0)*(1.0-face);
        float phase=p.x*2.4+p.y*3.1-t*0.13+seed*0.06;
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float shine=pow(0.5+0.5*sin(phase*6.2831853),9.0);
        color*=1.0-metal*0.16;
        color+=(1.0-color)*mix(vec3(0.48,0.67,0.84),spectrum,0.75)*metal*(0.32+0.69*shine);
        vec3 hue=0.5+0.5*cos(6.2831853*(p.x*1.25-p.y*1.4-t*0.10+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 overlay=mix(2.0*color*hue,1.0-2.0*(1.0-color)*(1.0-hue),step(vec3(0.5),color));
        color=mix(color,overlay,0.28*(1.0-face));
        color+=spectrum*wings*0.16;
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
