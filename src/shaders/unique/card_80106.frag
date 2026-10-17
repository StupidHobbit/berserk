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

float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.25,1.0,length((p-c)/r));
}
float lineDistance(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.00001),0.0,1.0));
}
vec2 curse(float f,float side,float t) {
    float g=1.0-f;
    // Follow the painted shadow streaming from the raised right palm.
    vec2 c=g*g*g*vec2(0.585,0.199)
        +3.0*g*g*f*vec2(1.055,0.270)
        +3.0*g*f*f*vec2(0.967,0.475)
        +f*f*f*vec2(0.619,0.548);
    c+=vec2(side*0.021*sin(f*3.14159),side*0.013*sin(f*3.14159));
    c+=vec2(0.009*sin(f*18.0-t*2.2+side),0.006*cos(f*21.0-t*2.8))*sin(f*3.14159);
    return c;
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173)*6.283185;
    vec2 metric=vec2(1.0,1.4113);
    float art=smoothstep(0.140,0.156,p.y)*(1.0-smoothstep(0.540,0.558,p.y));
    art*=smoothstep(0.018,0.040,p.x)*(1.0-smoothstep(0.962,0.985,p.x));
    // Explicit holes include the shield, regeneration icon and its counter.
    art*=smoothstep(0.062,0.079,length((p-vec2(0.108,0.179))*metric));
    art*=smoothstep(0.062,0.078,length((p-vec2(0.107,0.260))*metric));
    art*=smoothstep(0.028,0.041,length((p-vec2(0.150,0.286))*metric));
    vec3 color=scan.rgb;
    vec2 palm=vec2(0.581,0.197);
    float ink=0.0;
    float sparks=0.0;
    float haze=0.0;
    // Large travelling violet knots resolve even on the compact card.
    for(int i=0;i<20;i++) {
        float k=float(i);
        float side=mod(k,3.0)-1.0;
        float f=fract(t*(0.32+0.025*side)+k*0.137+seed*0.03);
        vec2 a=curse(f,side,t);
        vec2 b=curse(max(0.0,f-0.060),side,t);
        float d=lineDistance(p*metric,a*metric,b*metric);
        float env=smoothstep(0.0,0.08,f)*(1.0-smoothstep(0.83,1.0,f));
        float strength=0.50+0.50*sin(k*2.1)*sin(k*2.1);
        ink+=(1.0-smoothstep(0.0018,0.0055+aa*0.55,d))*env*strength;
        haze+=exp(-d/0.020)*env*strength;
        float head=length((p-a)*metric);
        sparks+=(1.0-smoothstep(0.002,0.007+aa*0.5,head))*env;
    }
    color+=vec3(0.25,0.035,0.39)*min(ink,1.5);
    color+=vec3(0.026,0.001,0.052)*min(haze,2.0);
    color+=vec3(0.24,0.17,0.12)*min(sparks,1.3);

    // Broken rotating rings bind the discharge to the glowing palm.
    vec2 q=(p-palm)*metric;
    float radius=length(q);
    float angle=atan(q.y,q.x);
    float rings=0.0;
    for(int i=0;i<3;i++) {
        float k=float(i);
        float phase=fract(t*0.41+k/3.0+seed*0.03);
        float r=0.022+phase*0.081;
        float ring=1.0-smoothstep(0.0015,0.004+aa*0.45,abs(radius-r));
        float broken=smoothstep(-0.12,0.35,sin(angle*3.0+t*3.0+k*1.4));
        rings+=ring*broken*sin(phase*3.14159);
    }
    color+=vec3(0.24,0.09,0.34)*rings;
    color+=vec3(0.14,0.06,0.19)*oval(p,palm,vec2(0.044,0.029))*(0.65+0.35*sin(t*5.7+seed));

    // The single eye pulses amber as the warlock casts his blinding curse.
    vec2 eye=vec2(0.448,0.262);
    float charge=0.5+0.5*sin(t*4.1+seed);
    color+=vec3(0.35,0.16,0.015)*oval(p,eye,vec2(0.021,0.011))*(0.35+0.65*charge);
    float face=oval(p,vec2(0.443,0.278),vec2(0.062,0.051));
    if(u_is_foil) {
        // Saturated copper, emerald and violet lacquer remains at frozen time.
        vec3 spectrum=0.5+0.5*cos(6.283185*(p.x*1.75+p.y*1.15-t*0.10+seed*0.035+vec3(0.0,0.33,0.67)));
        vec3 metal=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,metal,0.48*(1.0-face*0.85));
        float sheen=pow(0.5+0.5*sin(p.x*27.0+p.y*39.0-t*1.4+seed),14.0);
        color+=(1.0-color)*spectrum*sheen*0.20*(1.0-face);
        color+=vec3(0.10,0.08,0.035)*min(ink+rings,1.0);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
