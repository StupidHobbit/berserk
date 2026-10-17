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

// Рулевой: two following-wind gusts stream past the helmsman; the throwing
// wheel carries a traveling bronze charge. Coordinates follow the printed scan.
float oval(vec2 p, vec2 c, vec2 r) {
    return 1.0-smoothstep(0.55,1.0,length((p-c)/r));
}
float hash(float n) { return fract(sin(n*127.1+49.2)*43758.5453); }
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.y,1.0);
    float ax=1.0/max(u_resolution.x,1.0);
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.173);
    // The class strip ends above .14; ornamental stat frame begins at .55.
    float art=smoothstep(0.140,0.153,p.y)*(1.0-smoothstep(0.536,0.549,p.y));
    art*=smoothstep(0.006,0.021,p.x)*(1.0-smoothstep(0.980,0.994,p.x));
    float face=oval(p,vec2(0.538,0.220),vec2(0.093,0.087));
    float body=oval(p,vec2(0.494,0.344),vec2(0.279,0.214));
    float sea=smoothstep(0.05,0.20,scan.b-scan.r)*smoothstep(0.02,0.12,scan.g-scan.r);
    float background=(1.0-body*0.92)*(1.0-face);
    vec3 color=scan.rgb;
    // Bending parallel gusts visibly travel with the cresting turquoise sea.
    float wind=0.0;
    float wake=0.0;
    for(int i=0;i<6;i++) {
        float k=float(i);
        float y=0.223+k*0.025-0.060*p.x+0.012*sin(p.x*9.0-k*0.8-t*1.7);
        float d=abs(p.y-y);
        float head=fract(t*0.29+seed+k*0.168);
        float x=head*1.42-0.21;
        float trail=smoothstep(x-0.31,x-0.06,p.x)*(1.0-smoothstep(x-0.025,x+0.024,p.x));
        float line=1.0-smoothstep(0.0015,0.004+aa,d);
        wind+=line*trail;
        wake+=exp(-d*d/0.00015)*trail*0.3;
    }
    color+=vec3(0.13,0.51,0.53)*wind*background;
    color+=vec3(0.015,0.085,0.12)*wake*background;
    // Moving ripples stay on the blue water, leaving the sailor's face intact.
    float crest=pow(0.5+0.5*sin(p.x*42.0+p.y*58.0-t*4.5),6.0);
    color+=vec3(0.015,0.13,0.17)*crest*sea*(1.0-body*0.8);
    float spray=0.0;
    for(int i=0;i<18;i++) {
        float k=float(i);
        float age=fract(t*(0.28+0.09*hash(k+8.0))+k*0.618+seed);
        vec2 c=vec2(-0.08+age*1.19,0.28+hash(k+2.0)*0.19-age*0.12);
        c.y+=0.009*sin(age*8.0+k);
        vec2 r=vec2(0.009+0.008*hash(k+13.0)+ax,0.0014+aa*0.6);
        spray+=(1.0-smoothstep(0.25,1.0,length((p-c)/r)))*sin(age*3.141593);
    }
    color+=vec3(0.20,0.48,0.48)*spray*background;
    // Two moving crescents follow the wheel rim: the two wind bonuses and
    // the thrown wheel ability are represented without moving painted spokes.
    vec2 wheel=(p-vec2(0.560,0.446))/vec2(0.245,0.163);
    float radius=length(wheel);
    float angle=atan(wheel.y,wheel.x);
    float rim=1.0-smoothstep(0.035,0.080+aa*4.0,abs(radius-0.98));
    float rotation=angle-t*2.15-seed*6.283185;
    float charge=pow(0.5+0.5*cos(rotation*2.0),11.0);
    float bronze=smoothstep(-0.025,0.08,scan.r-scan.b);
    color+=vec3(0.43,0.23,0.045)*rim*charge*(0.5+0.5*bronze)*(1.0-face);
    color+=vec3(0.025,0.11,0.14)*rim*(1.0-charge)*(1.0-face);
    if(u_is_foil) {
        // Fixed interference at t=0 makes the reduced-motion edition distinct.
        float phase=p.x*1.55+p.y*2.3+radius*0.18+t*0.10+seed*0.3;
        vec3 spectrum=0.5+0.5*cos(6.283185*(phase+vec3(0.0,0.333,0.667)));
        float finish=(0.55+0.25*sea+0.15*rim)*(1.0-face*0.9);
        vec3 metal=mix(2.0*color*spectrum,1.0-2.0*(1.0-color)*(1.0-spectrum),step(vec3(0.5),color));
        color=mix(color,metal,finish*0.58);
        float sheen=pow(0.5+0.5*sin(p.x*13.0-p.y*17.0-t*1.35),9.0);
        color+=(1.0-color)*(0.04+spectrum*0.16)*finish;
        color+=(1.0-color)*mix(vec3(0.75,0.57,0.20),spectrum,0.60)*sheen*finish*0.39;
        color+=mix(vec3(0.21,0.13,0.025),spectrum*0.27,0.50)*rim*(0.35+charge*0.65);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
