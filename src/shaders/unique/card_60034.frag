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

// Эр-Мариб: the two palms feed the painted fire rays and the two wounds
// in the stone creature. Coordinates refer to the base 496 x 700 print.
float emberOval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.15,1.0,length((p-c)/r));
}
float emberLine(vec2 p, vec2 a, vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/dot(d,d),0.0,1.0));
}

void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 original=texture2D(u_card,v_uv);
    vec3 col=original.rgb;
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.1731)*6.2831853;
    float art=smoothstep(0.139,0.150,p.y)*(1.0-smoothstep(0.548,0.559,p.y));
    art*=smoothstep(0.008,0.021,p.x)*(1.0-smoothstep(0.978,0.992,p.x));
    // Shield badge and its pale ornamental rim are never illuminated.
    art*=smoothstep(0.062,0.075,length((p-vec2(0.107,0.181))*vec2(1.0,1.4113)));

    float pulse=0.62+0.38*sin(t*2.8+seed);
    float lum=dot(original.rgb,vec3(0.2126,0.7152,0.0722));
    vec2 palm=vec2(0.480,0.233);
    vec2 source=vec2(0.727,0.268);
    float hands=emberOval(p,palm,vec2(0.075,0.046))
               +emberOval(p,source,vec2(0.065,0.044));
    col+=(1.0-col)*vec3(1.0,0.56,0.10)*hands*(0.30+0.36*pulse);
    float cores=emberOval(p,palm,vec2(0.020,0.015))
               +emberOval(p,source,vec2(0.017,0.014));
    col+=vec3(0.65,0.47,0.16)*cores*(0.45+0.45*pulse);

    // Follow the existing upper ray to the golem's shoulder; its body
    // occludes the ray. The lower diagonal follows the second painted burn.
    float beams=0.0;
    float beamHaze=0.0;
    for (int i=0;i<24;i++) {
        float k=float(i);
        float lower=step(12.0,k);
        float f=mod(k,12.0)/12.0;
        float next=f+1.0/12.0;
        vec2 a=mix(source,vec2(0.173,0.444),lower);
        vec2 b=mix(vec2(0.441,0.301),vec2(0.012,0.544),lower);
        vec2 q=mix(a,b,f);
        vec2 r=mix(a,b,next);
        float amp=mix(0.003,0.005,lower);
        q.y+=sin(f*23.0-t*5.2+seed)*amp*sin(f*3.14159265);
        r.y+=sin(next*23.0-t*5.2+seed)*amp*sin(next*3.14159265);
        float d=emberLine(p,q,r);
        float flow=0.63+0.37*sin(f*18.0-t*6.0+seed+lower);
        beams=max(beams,(1.0-smoothstep(0.001,0.003+aa,d))*flow);
        beamHaze=max(beamHaze,exp(-d*d/0.00016)*flow);
    }
    col+=(1.0-col)*vec3(0.95,0.39,0.035)*beamHaze*0.44;
    col+=vec3(0.72,0.47,0.14)*beams*0.65;

    float wounds=emberOval(p,vec2(0.060,0.373),vec2(0.098,0.040))
                +emberOval(p,vec2(0.173,0.444),vec2(0.085,0.038));
    float paintedFire=smoothstep(0.09,0.36,original.r-original.b)
                      *smoothstep(0.17,0.60,lum);
    col+=(1.0-col)*vec3(0.95,0.33,0.035)*wounds*(0.20+0.35*pulse);
    col+=vec3(0.26,0.15,0.025)*wounds*paintedFire*(0.35+0.55*pulse);

    // Short tongues rise off both impact wounds, with sparks travelling
    // upward through the adjacent dark rock. No source texture is moved.
    float flame=0.0;
    float sparks=0.0;
    for (int i=0;i<12;i++) {
        float k=float(i);
        float lower=step(6.0,k);
        float n=mod(k,6.0);
        vec2 hit=mix(vec2(0.060,0.373),vec2(0.173,0.444),lower);
        float sideways=(n-2.5)*0.013;
        float h=(hit.y-p.y)/0.041;
        float sway=sin(h*6.0-t*4.0+n+seed)*0.006*h;
        float tongue=abs(p.x-hit.x-sideways-sway);
        float env=smoothstep(-0.10,0.10,h)*(1.0-smoothstep(0.55,1.0,h));
        float width=0.0035*(1.0-clamp(h,0.0,1.0));
        flame=max(flame,(1.0-smoothstep(width,width+aa*1.25,tongue))*env);
        float flight=fract(t*(0.22+0.013*n)+n*0.167+seed*0.07);
        vec2 pos=hit+vec2(sideways*1.4+sin(n*3.7+flight*4.0)*0.010,
                         -0.006-flight*0.069);
        float distanceToSpark=length((p-pos)*vec2(1.0,1.4113));
        sparks+=(1.0-smoothstep(0.0012,0.0030+aa,distanceToSpark))
                *sin(flight*3.14159265);
    }
    col+=vec3(0.55,0.25,0.035)*flame*(0.75+0.25*pulse);
    col+=vec3(0.75,0.43,0.10)*sparks*0.70;

    if (u_is_foil) {
        // Broad embossed metallic bands follow the red robe and angular
        // stone. Their static colour separation also survives reduced motion.
        float robe=emberOval(p,vec2(0.681,0.424),vec2(0.270,0.180));
        float rock=emberOval(p,vec2(0.307,0.360),vec2(0.329,0.190));
        float face=emberOval(p,vec2(0.735,0.194),vec2(0.052,0.044));
        float red=smoothstep(0.035,0.28,original.r-original.g);
        float material=clamp(0.25+robe*0.40+rock*0.24+red*0.15,0.0,0.90);
        material*=1.0-face*0.90;
        float facets=p.x*2.1+p.y*2.7+sin(p.x*16.0-p.y*11.0)*0.10;
        vec3 metal=0.5+0.5*cos(6.2831853*(facets+t*0.085+seed*0.05
                                  +vec3(0.0,0.32,0.64)));
        vec3 tint=mix(2.0*col*metal,
                      1.0-2.0*(1.0-col)*(1.0-metal),step(vec3(0.5),col));
        col=mix(col,tint,material*0.44);
        float reflection=pow(0.5+0.5*sin(facets*8.5-t*1.0),6.0);
        col+=(1.0-col)*(metal*0.15+vec3(0.045,0.035,0.018))*material;
        col+=(1.0-col)*mix(vec3(0.94,0.78,0.40),metal,0.45)
             *reflection*material*(0.20+0.18*smoothstep(0.15,0.7,lum));
    }
    gl_FragColor=vec4(mix(original.rgb,clamp(col,0.0,1.0),art),original.a);
}
