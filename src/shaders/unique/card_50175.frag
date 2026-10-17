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

// Тёмный епископ: blessing and curse meet at the illuminated sword.
// Coordinates are measured from the top left of the base 496 x 700 print.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
float segment(vec2 p, vec2 a, vec2 b) {
    vec2 v=b-a;
    return length(p-a-v*clamp(dot(p-a,v)/dot(v,v),0.0,1.0));
}
vec2 current(float f, float side, float t) {
    vec2 a=mix(vec2(0.402,0.337),vec2(0.566,0.386),side);
    vec2 b=mix(vec2(0.324,0.433),vec2(0.650,0.466),side);
    vec2 c=vec2(0.480,0.474);
    vec2 p=(1.0-f)*(1.0-f)*a+2.0*f*(1.0-f)*b+f*f*c;
    p.x+=sin(f*12.0-t*1.25+side*2.8)*sin(f*3.141593)*0.008;
    return p;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 base=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.2831853;
    float art=smoothstep(0.138,0.149,p.y)*(1.0-smoothstep(0.545,0.557,p.y));
    art*=smoothstep(0.012,0.028,p.x)*(1.0-smoothstep(0.972,0.988,p.x));
    // Printed magic-defense shield and the skeletal lower frame stay untouched.
    art*=smoothstep(0.055,0.067,length((p-vec2(0.109,0.180))*vec2(1.0,1.4113)));
    art*=smoothstep(0.115,0.145,length((p-vec2(0.126,0.595))*vec2(1.0,1.4113)));
    art*=smoothstep(0.115,0.145,length((p-vec2(0.870,0.595))*vec2(1.0,1.4113)));
    vec3 col=base.rgb;
    float lum=dot(base.rgb,vec3(0.2126,0.7152,0.0722));
    float pulse=0.5+0.5*sin(t*1.65+seed);
    float face=oval(p,vec2(0.501,0.185),vec2(0.069,0.059));
    float well=oval(p,vec2(0.480,0.457),vec2(0.142,0.148));
    // The painted golden furnace breathes upward along the sword and chest.
    float fire=0.5+0.5*sin(p.y*32.0-t*2.0+sin(p.x*24.0+seed));
    col+=(1.0-col)*vec3(0.61,0.28,0.045)*well*(0.24+0.30*pulse+0.20*fire);
    float blade=1.0-smoothstep(0.002,0.007+aa,segment(p,vec2(0.480,0.476),vec2(0.480,0.556)));
    float guard=1.0-smoothstep(0.001,0.004+aa,min(segment(p,vec2(0.367,0.496),vec2(0.480,0.474)),segment(p,vec2(0.480,0.474),vec2(0.575,0.496))));
    col+=vec3(0.38,0.26,0.085)*(blade*0.35+guard*(0.35+0.35*pulse));
    vec3 gold=vec3(0.95,0.57,0.12);
    vec3 curse=vec3(0.47,0.23,0.86);
    // Two simultaneous currents represent the two recipients of his discharge.
    for (int i=0;i<28;i++) {
        float k=float(i);
        float side=step(14.0,k);
        float f=mod(k,14.0)/14.0;
        vec2 a=current(f,side,t+seed);
        vec2 b=current(f+1.0/14.0,side,t+seed);
        float d=segment(p,a,b);
        float flow=0.24+0.76*pow(0.5+0.5*sin(f*13.0-t*3.2+side*2.7+seed),3.0);
        float line=1.0-smoothstep(0.0006,0.0024+aa,d);
        float haze=exp(-d*d/0.00012);
        col+=mix(gold,curse,side)*(line*0.22+haze*0.055)*flow;
    }
    float blessed=oval(p,vec2(0.402,0.337),vec2(0.047,0.032));
    float cursed=oval(p,vec2(0.566,0.386),vec2(0.062,0.038));
    col+=(1.0-col)*(gold*blessed+curse*cursed)*(0.28+0.25*pulse);
    // Quiet blue light travels along the two tall, curved shoulder horns.
    float horns=oval(p,vec2(0.190,0.250),vec2(0.145,0.075))
               +oval(p,vec2(0.807,0.248),vec2(0.145,0.079));
    float silver=smoothstep(0.17,0.56,lum)*(1.0-smoothstep(0.03,0.15,base.r-base.b));
    float ward=0.5+0.5*sin(abs(p.x-0.5)*23.0+t*1.2+seed);
    col+=(1.0-col)*vec3(0.16,0.32,0.42)*horns*silver*(0.25+0.55*ward);
    if (u_is_foil) {
        // Red vestments acquire broad engraved metal bands. Spatial color and
        // the fixed specular lobe remain visible with reduced motion at t=0.
        float robe=oval(p,vec2(0.495,0.400),vec2(0.385,0.252));
        float red=smoothstep(0.025,0.20,base.r-base.g);
        float metal=clamp(robe*0.72+horns*silver*0.55,0.0,0.95)*(1.0-face);
        float folds=p.y*2.7+abs(p.x-0.48)*1.6+sin(p.x*30.0+p.y*11.0)*0.044;
        vec3 iridescence=0.5+0.5*cos(6.2831853*(folds+t*0.085+seed*0.04+vec3(0.0,0.333,0.667)));
        vec3 coat=mix(2.0*col*iridescence,1.0-2.0*(1.0-col)*(1.0-iridescence),step(vec3(0.5),col));
        col=mix(col,coat,metal*0.46);
        float sheen=pow(0.5+0.5*sin(folds*10.0-t*1.0+seed),7.0);
        col+=(1.0-col)*(vec3(0.08,0.055,0.025)+iridescence*0.19)*metal;
        col+=(1.0-col)*mix(vec3(0.95,0.78,0.40),iridescence,0.45)*sheen*metal*(0.36+0.19*red);
        col+=vec3(0.11,0.19,0.23)*horns*silver*(0.30+0.50*ward);
    }
    gl_FragColor=vec4(mix(base.rgb,clamp(col,0.0,1.0),art),base.a);
}
