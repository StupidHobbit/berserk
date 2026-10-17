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

// Сердце мира: lost mountain charges feed the carved heart; its strength
// spreads across the glacier as a fortress ward. Top-left scan coordinates.
float hash(float x) { return fract(sin(x*127.1+37.9)*43758.5453); }
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.5,1.0,length((p-c)/r));
}
float lineDistance(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}
vec2 chargePath(float f) {
    return mix(vec2(0.205,0.433),vec2(0.433,0.228),f)
           +vec2(0.045,-0.035)*sin(f*3.141593);
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=u_time;
    float seed=fract(u_seed*0.137);
    // Stop above all three shields, decorative swords and the rules frame.
    float art=smoothstep(0.139,0.153,p.y)*(1.0-smoothstep(0.539,0.556,p.y));
    art*=smoothstep(0.012,0.025,p.x)*(1.0-smoothstep(0.977,0.990,p.x));
    vec3 color=scan.rgb;
    float ice=oval(p,vec2(0.248,0.360),vec2(0.112,0.245));
    float blue=smoothstep(0.025,0.22,scan.b-scan.r);
    float fall=0.5+0.5*sin(p.y*92.0-t*5.7+sin(p.x*65.0)*1.6);
    float streams=pow(0.5+0.5*sin(p.x*145.0+sin(p.y*24.0)*0.7),5.0);
    color+=vec3(0.015,0.22,0.31)*ice*blue*streams*fall;

    // The paired counters move up from the blue ice cliff, merging at the
    // existing rune stone instead of floating independently of the picture.
    float cycle=fract(t*0.22+seed);
    float charges=0.0;
    float wake=0.0;
    for (int i=0;i<18;i++) {
        float fi=float(i);
        float side=step(8.5,fi);
        float age=cycle-mod(fi,9.0)*0.012;
        float f=clamp(age/0.72,0.0,1.0);
        vec2 q=chargePath(f);
        q.x+=(side-0.5)*0.027*(1.0-f);
        float d=length((p-q)*vec2(1.0,0.71));
        float gate=smoothstep(0.0,0.035,age)*(1.0-smoothstep(0.70,0.76,age));
        float strength=1.0-mod(fi,9.0)/10.0;
        charges+=(1.0-smoothstep(0.0038,0.0065+aa*0.5,d))*gate*strength;
        wake+=exp(-d*d/0.00026)*gate*strength*0.13;
    }
    // Dark cyan halos keep the charge motion readable over the pale snow.
    color=mix(color,vec3(0.045,0.27,0.36),min(wake*0.26,0.25));
    color+=vec3(0.09,0.59,0.66)*min(charges,1.2);

    float heart=oval(p,vec2(0.433,0.226),vec2(0.045,0.057));
    float beat=pow(0.5+0.5*sin(t*3.0+seed*6.28),4.0);
    color=mix(color,vec3(0.12,0.47,0.54),heart*(0.08+0.21*beat));
    // Carved steps in the tall central monolith sequentially light upward.
    float stone=oval(p,vec2(0.445,0.191),vec2(0.062,0.093));
    float zig=abs(fract(p.y*59.0+p.x*20.0)-0.5);
    float rune=(1.0-smoothstep(0.05,0.13,zig))*stone;
    float climb=pow(0.5+0.5*sin(p.y*75.0+t*3.9),6.0);
    color=mix(color,vec3(0.02,0.40,0.49),rune*(0.15+0.5*climb));

    // An expanding angular ward follows the buttressed mountain face.
    vec2 w=(p-vec2(0.448,0.267))*vec2(1.0,0.74);
    float angular=max(abs(w.x)*0.75+abs(w.y)*0.65,abs(w.y));
    float wardAge=fract(t*0.22+seed+0.22);
    float radius=0.025+wardAge*0.32;
    float ward=(1.0-smoothstep(0.0025,0.006+aa,abs(angular-radius)));
    ward*=sin(wardAge*3.141593)*oval(p,vec2(0.48,0.345),vec2(0.37,0.20));
    color=mix(color,vec3(0.09,0.51,0.62),ward*0.36);

    // Long, sparse gusts cross the exposed valley; each has a moving head.
    float snow=0.0;
    for (int i=0;i<20;i++) {
        float fi=float(i);
        float h=hash(fi+3.0);
        float f=fract(t*(0.12+0.055*h)+hash(fi+19.0)+seed);
        vec2 q=vec2(1.09-f*1.2,0.213+hash(fi+41.0)*0.30);
        q.y+=sin(f*6.283+fi)*0.015-f*0.026;
        float d=lineDistance(p,q,q+vec2(0.023+0.016*h,0.004));
        snow+=(1.0-smoothstep(0.0011,0.0023+aa*0.45,d))
             *sin(f*3.141593)*(0.5+0.5*h);
    }
    color+=vec3(0.32,0.48,0.51)*snow;

    if (u_is_foil) {
        // Faceted turquoise/amethyst metal is already apparent at time zero.
        float phase=p.x*2.4+p.y*3.0+seed+t*0.11
                    +0.12*sin(p.x*17.0-p.y*28.0);
        vec3 spectrum=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        vec3 metallic=vec3(0.16,0.28,0.34)+spectrum*vec3(0.68,0.60,0.64);
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        color=mix(color,color*metallic*1.40,0.43);
        float facets=pow(0.5+0.5*sin(p.x*38.0-p.y*51.0+t*1.7),14.0);
        color+=(1.0-color)*metallic*facets*(0.12+0.20*luma);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
