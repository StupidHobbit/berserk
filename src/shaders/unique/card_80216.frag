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
    return 1.0-smoothstep(0.38,1.0,length((p-c)/r));
}
float vein(vec2 p,vec2 a,vec2 b,float t,float aa) {
    vec2 d=b-a;
    float q=clamp(dot(p-a,d)/dot(d,d),0.0,1.0);
    float dist=length(p-a-d*q);
    float pulse=pow(0.5+0.5*cos(q*13.0-t*4.4),6.0);
    return (1.0-smoothstep(0.002,0.008+aa,dist))*(0.12+0.88*pulse)
           *smoothstep(0.0,0.08,q)*(1.0-smoothstep(0.88,1.0,q));
}
void main() {
    vec4 scan=texture2D(u_card,v_uv);
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    float aa=max(0.0008,0.65/max(u_resolution.x,1.0));
    float t=max(0.0,u_time);
    float seed=fract(u_seed*0.173)*6.2831853;
    // The class strip ends at .139; ornaments start below .548.
    float art=smoothstep(0.143,0.157,p.y)*(1.0-smoothstep(0.532,0.545,p.y));
    art*=smoothstep(0.008,0.026,p.x)*(1.0-smoothstep(0.974,0.993,p.x));
    if(art<=0.0) { gl_FragColor=scan; return; }
    vec3 col=scan.rgb;
    float lum=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
    float leftWing=oval(p,vec2(0.206,0.306),vec2(0.285,0.193));
    float rightWing=oval(p,vec2(0.886,0.269),vec2(0.119,0.161));
    float chest=oval(p,vec2(0.719,0.454),vec2(0.164,0.158));
    float face=oval(p,vec2(0.614,0.266),vec2(0.113,0.082));
    float cycle=sin(t*1.05+seed);
    float healing=smoothstep(-0.22,0.22,cycle);
    vec3 chaos=mix(vec3(1.0,0.16,0.055),vec3(0.13,0.88,0.54),healing);

    // The dragon's own damage travels through the wing spars; recovery
    // reverses the flow. Both phases remain readable on a compact card.
    float direction=mix(1.0,-1.0,healing);
    float flow=t*direction+seed;
    vec2 joint=vec2(0.378,0.226);
    float veins=vein(p,joint,vec2(0.023,0.202),flow,aa);
    veins+=vein(p,joint,vec2(0.023,0.298),flow+0.5,aa);
    veins+=vein(p,joint,vec2(0.063,0.471),flow+1.0,aa);
    veins+=vein(p,joint,vec2(0.446,0.444),flow+1.5,aa);
    veins+=vein(p,vec2(0.798,0.367),vec2(0.882,0.199),flow+0.7,aa);
    col+=chaos*veins*0.72;
    float wingWave=pow(0.5+0.5*sin(length((p-joint)*vec2(1.0,1.42))*58.0-t*5.0+seed),6.0);
    col+=(1.0-col)*chaos*(leftWing+rightWing)*wingWave*0.24;

    // Six branching life motes reference the die: blood-red outward wounds,
    // then green currents returning into the scaled chest to heal it.
    vec2 heart=vec2(0.690,0.414);
    for(int i=0;i<6;i++) {
        float k=float(i);
        float ang=0.32+k*0.53;
        vec2 axis=vec2(cos(ang),-sin(ang));
        vec2 normal=vec2(-axis.y,axis.x);
        vec2 local=(p-heart)*vec2(1.0,1.42);
        float extent=0.22+0.025*sin(k*2.4);
        float q=dot(local,axis)/extent;
        float bend=0.022*sin(q*5.0+k*1.7+t*1.1);
        float dist=abs(dot(local,normal)-bend*sin(clamp(q,0.0,1.0)*3.14159265));
        float s=fract(t*0.33+k/6.0+seed*0.03);
        float travel=mix(s,1.0-s,healing);
        float head=exp(-pow((q-travel)/0.045,2.0));
        float tail=exp(-pow((q-travel+direction*0.10)/0.13,2.0));
        float visible=smoothstep(0.02,0.14,q)*(1.0-smoothstep(0.84,1.0,q));
        float thread=(1.0-smoothstep(0.0015,0.006+aa,dist))*tail;
        float mote=(1.0-smoothstep(0.003,0.011+aa,dist))*head;
        col+=chaos*(thread*0.57+mote*0.92)*visible;
    }
    float scales=pow(0.5+0.5*sin(p.y*96.0+p.x*21.0-t*4.5+seed),7.0);
    col+=(1.0-col)*chaos*chest*scales*0.33;
    float eye=oval(p,vec2(0.624,0.240),vec2(0.011,0.007));
    col+=vec3(1.0,0.25,0.025)*eye*(0.65+0.30*sin(t*4.0+seed));

    if(u_is_foil) {
        // Iridescent dragon scales and gold membranes are visible at t=0.
        float material=clamp(leftWing*0.90+rightWing*0.88+chest,0.0,1.0);
        material*=1.0-face*0.80;
        float phase=p.x*2.1+p.y*3.9+0.16*sin(p.y*29.0)-t*0.17+seed*0.08;
        vec3 spectral=0.5+0.5*cos(6.2831853*(phase+vec3(0.0,0.33,0.67)));
        float band=pow(0.5+0.5*sin(phase*6.2831853),5.0);
        float detail=smoothstep(0.15,0.62,lum);
        col*=1.0-0.23*material;
        col+=(1.0-col)*mix(vec3(0.77,0.48,0.15),spectral,0.78)
             *material*(0.34+band*0.48+detail*0.14);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
