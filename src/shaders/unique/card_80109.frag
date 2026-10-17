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

// Дозор Энтарна: the dragon's wing wash converges on a landing mark,
// then the rider releases an arrow and the ascending slipstream returns.
// Landmarks are in top-left scan coordinates (496 x 700).
float oval(vec2 p,vec2 c,vec2 r) {
    return 1.0-smoothstep(0.42,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
float stroke(vec2 p,vec2 a,vec2 b,float aa) {
    return 1.0-smoothstep(0.0008,0.0018+aa,segment(p,a,b));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=max(1.0/max(u_resolution.x,1.0),1.0/max(u_resolution.y,1.0));
    float t=max(u_time,0.0);
    float seed=fract(u_seed*0.1397);
    float cycle=fract(t/7.0+seed*0.16);
    float landing=smoothstep(0.12,0.29,cycle)*(1.0-smoothstep(0.43,0.53,cycle));
    float ascent=smoothstep(0.48,0.65,cycle)*(1.0-smoothstep(0.91,1.0,cycle));
    // Keep every printed element, including the upper-left shield, intact.
    float art=smoothstep(0.139,0.156,p.y)*(1.0-smoothstep(0.538,0.553,p.y));
    art*=smoothstep(0.015,0.035,p.x)*(1.0-smoothstep(0.965,0.985,p.x));
    art*=smoothstep(1.0,1.16,length((p-vec2(0.109,0.182))/vec2(0.062,0.044)));
    vec3 color=scan.rgb;
    float gold=smoothstep(0.03,0.21,scan.r-scan.b)*smoothstep(-0.015,0.16,scan.g-scan.b);
    float dragon=oval(p,vec2(0.31,0.405),vec2(0.25,0.12))
                +oval(p,vec2(0.47,0.353),vec2(0.11,0.17));
    float wings=oval(p,vec2(0.80,0.312),vec2(0.25,0.071))
               +oval(p,vec2(0.31,0.209),vec2(0.08,0.11));
    float wave=0.5+0.5*sin(p.x*24.0-p.y*19.0-t*3.2+seed*6.28);
    color+=(1.0-color)*vec3(0.25,0.16,0.025)*gold*min(dragon+wings,1.0)*(0.10+0.36*wave);

    // Curved air filaments leave the actual red wing and rear talons.
    // Their downward/ascending motion describes the patrol's landing cycle.
    float wind=0.0;
    for(int i=0;i<8;i++) {
        float k=float(i);
        float age=fract(t*0.22+k/8.0+seed);
        float x=0.64+0.035*k+0.055*sin(age*3.14159);
        float y=mix(0.335,0.515,age);
        y=mix(y,mix(0.515,0.31,age),ascent);
        vec2 c=vec2(x,y);
        float fade=sin(age*3.14159);
        vec2 tail=c+vec2(0.012,0.027*(1.0-2.0*ascent));
        wind+=stroke(p,c,tail,aa)*fade*(0.10+0.20*landing+0.25*ascent);
    }
    color+=vec3(0.22,0.45,0.37)*wind;

    // A flattened leaf-green landing seal beneath the painted rear claw.
    vec2 ground=(p-vec2(0.651,0.508))/vec2(1.0,0.32);
    float radius=0.036+0.044*landing;
    float ring=1.0-smoothstep(0.0012,0.003+aa*1.7,abs(length(ground)-radius));
    float breaks=0.35+0.65*pow(0.5+0.5*sin(atan(ground.y,ground.x)*6.0+t*1.2),2.0);
    color+=vec3(0.20,0.53,0.19)*ring*breaks*landing*0.65;
    float leaves=0.0;
    for(int i=0;i<6;i++) {
        float k=float(i);
        float age=fract(t*0.19+k/6.0+seed);
        float angle=k*2.399+age*3.0;
        vec2 c=vec2(0.65,0.50)+vec2(cos(angle)*(0.035+age*0.075),-age*0.16);
        vec2 q=p-c;
        float ca=cos(angle),sa=sin(angle);
        q=mat2(ca,-sa,sa,ca)*q;
        float d=length(q/vec2(0.007,0.0028));
        leaves+=(1.0-smoothstep(0.45,1.0+aa*90.0,d))*sin(age*3.14159)*ascent;
    }
    color=mix(color,vec3(0.64,0.82,0.26),min(leaves*0.42,0.55));

    // The bow on the rider's right charges, then shoots into the open sky.
    float charge=smoothstep(0.29,0.43,cycle)*(1.0-smoothstep(0.49,0.54,cycle));
    vec2 bow=vec2(0.638,0.288);
    float bowlight=oval(p,bow,vec2(0.022,0.061));
    color+=vec3(0.31,0.47,0.17)*bowlight*charge*0.65;
    float shot=clamp((cycle-0.48)/0.19,0.0,1.0);
    float shotFade=smoothstep(0.48,0.50,cycle)*(1.0-smoothstep(0.64,0.67,cycle));
    vec2 tip=mix(bow,vec2(0.945,0.221),shot);
    vec2 dir=normalize(vec2(0.307,-0.067));
    vec2 normal=vec2(-dir.y,dir.x);
    float arrow=stroke(p,tip-dir*0.065,tip,aa);
    arrow+=stroke(p,tip-dir*0.015+normal*0.007,tip,aa);
    arrow+=stroke(p,tip-dir*0.015-normal*0.007,tip,aa);
    float trail=exp(-segment(p,tip-dir*0.12,tip)/0.005)*0.19;
    color+=vec3(0.74,0.84,0.38)*(arrow*0.62+trail)*shotFade;

    if(u_is_foil) {
        // Metallic gold follows the dragon scales and bronze bow; wing
        // membranes carry a weaker opalescent finish with moving ridges.
        float phase=p.x*3.6+p.y*2.1-t*0.18+seed;
        vec3 iridescence=0.5+0.5*cos(6.28318*(phase+vec3(0.0,0.31,0.64)));
        float glint=pow(0.5+0.5*sin(phase*6.28318),13.0);
        float scales=0.55+0.45*pow(0.5+0.5*sin(p.x*150.0+p.y*95.0),4.0);
        float metal=min(dragon,1.0)*gold+bowlight*0.4;
        color+=(1.0-color)*mix(vec3(1.0,0.71,0.21),iridescence,0.45)*metal*scales*(0.14+0.70*glint);
        float membrane=smoothstep(0.02,0.17,scan.r-scan.g)*min(wings,1.0);
        color+=(1.0-color)*iridescence*membrane*(0.09+0.39*glint);
        // Low-strength foil substrate remains recognizable at compact size;
        // the card-specific metallic details above keep their stronger highlights.
        vec3 finishHue = 0.5 + 0.5*cos(6.2831853*(p.x*1.4+p.y*0.9-t*0.12+seed*0.07+vec3(0.0,0.33,0.67)));
        vec3 finishOverlay = mix(2.0*color*finishHue,
            1.0-2.0*(1.0-color)*(1.0-finishHue),step(vec3(0.5),color));
        color = mix(color,finishOverlay,0.25);

    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(color,0.0,1.0),art),scan.a);
}
