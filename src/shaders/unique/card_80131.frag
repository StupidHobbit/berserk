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
    return 1.0-smoothstep(0.36,1.0,length((p-c)/r));
}
float segment(vec2 p,vec2 a,vec2 b) {
    vec2 d=b-a;
    return length(p-a-d*clamp(dot(p-a,d)/max(dot(d,d),0.000001),0.0,1.0));
}
void main() {
    vec2 p=vec2(v_uv.x,1.0-v_uv.y);
    vec4 scan=texture2D(u_card,v_uv);
    float aa=1.0/max(u_resolution.x,1.0);
    vec2 asp=vec2(1.0,u_resolution.y/max(u_resolution.x,1.0));
    float seed=fract(u_seed*0.151);
    float t=u_time;
    // Illustration only: keep title, regeneration disc and its small counter,
    // then stop above the moss-covered stat frames at y=0.565.
    float art=smoothstep(0.140,0.155,p.y)*(1.0-smoothstep(0.545,0.565,p.y));
    art*=smoothstep(0.012,0.030,p.x)*(1.0-smoothstep(0.972,0.990,p.x));
    art*=clamp(smoothstep(0.190,0.215,p.x)+smoothstep(0.235,0.255,p.y),0.0,1.0);
    if (art<=0.0) { gl_FragColor=scan; return; }
    vec3 col=scan.rgb;

    // This enormous aquatic war machine pushes water out from its breastplate.
    // Moving crescents originate in the water visible between its forelimbs.
    float water=oval(p,vec2(0.510,0.549),vec2(0.37,0.073));
    float rings=0.0;
    for (int i=0;i<4;i++) {
        float age=fract(t*0.43+float(i)*0.25+seed);
        vec2 q=(p-vec2(0.510,0.527))*vec2(1.0,3.4);
        float radius=0.018+age*0.29;
        float d=abs(length(q)-radius);
        rings+=(1.0-smoothstep(0.002,0.007+aa*0.65,d))*(1.0-age);
    }
    col=mix(col,vec3(0.025,0.23,0.27),water*0.15);
    col+=(1.0-col)*vec3(0.20,0.73,0.83)*rings*water*0.85;

    // Two fan-shaped bursts of spray follow the existing splash at each side
    // of the body. Parabolic drops make ordinary prints visibly animate.
    float spray=0.0;
    float mist=0.0;
    for (int i=0;i<20;i++) {
        float fi=float(i);
        float side=mod(fi,2.0)*2.0-1.0;
        float h=fract(sin(fi*43.71+seed*19.0)*2947.73);
        float age=fract(t*(0.53+h*0.19)+fi*0.173+seed);
        vec2 start=vec2(0.51+side*0.12,0.547);
        vec2 c=start+vec2(side*(0.06+h*0.15)*age,-(0.12+h*0.07)*age+0.18*age*age);
        float prev=max(0.0,age-0.065);
        vec2 a=start+vec2(side*(0.06+h*0.15)*prev,-(0.12+h*0.07)*prev+0.18*prev*prev);
        float fade=smoothstep(0.0,0.09,age)*(1.0-smoothstep(0.72,1.0,age));
        float d=segment(p*asp,a*asp,c*asp);
        spray+=(1.0-smoothstep(0.0015,0.0045+aa*0.65,d))*fade;
        mist+=exp(-dot((p-c)*asp,(p-c)*asp)/0.00016)*fade;
    }
    col+=(1.0-col)*vec3(0.34,0.77,0.86)*min(spray*0.90+mist*0.12,1.0);

    // The companion's ranged attack: staggered copper bolts leave the right
    // bow arm, with a sharp head and a longer dim trail over the open sky.
    float bolts=0.0;
    for (int i=0;i<2;i++) {
        float age=fract(t*0.63+float(i)*0.5+seed);
        vec2 a=vec2(0.720,0.291);
        vec2 b=vec2(0.985,0.254);
        vec2 head=mix(a,b,age);
        vec2 tail=mix(a,b,max(0.0,age-0.18));
        float fade=smoothstep(0.0,0.06,age)*(1.0-smoothstep(0.86,1.0,age));
        float d=segment(p*asp,tail*asp,head*asp);
        bolts+=(1.0-smoothstep(0.001,0.004+aa*0.5,d))*fade;
    }
    col+=(1.0-col)*vec3(0.95,0.49,0.13)*bolts*0.90;

    // Slow underwater caustics climb the real armored breast and neck.
    float armor=oval(p,vec2(0.516,0.405),vec2(0.245,0.145));
    armor=max(armor,oval(p,vec2(0.492,0.279),vec2(0.10,0.10)));
    float caustic=pow(0.5+0.5*sin(p.y*75.0+p.x*16.0+sin(p.x*30.0-t)*1.6+t*3.1),12.0);
    col+=(1.0-col)*vec3(0.09,0.31,0.28)*caustic*armor*0.65;

    if (u_is_foil) {
        // Satin bronze/teal interference remains apparent on a frozen frame.
        float phase=p.x*1.8+p.y*2.0-t*0.11+seed*0.5;
        vec3 spectral=0.5+0.5*cos(6.283185*(phase+vec3(0.03,0.36,0.66)));
        vec3 coating=mix(2.0*col*spectral,1.0-2.0*(1.0-col)*(1.0-spectral),step(vec3(0.5),col));
        col=mix(col,coating,0.38+armor*0.12);
        float luma=dot(scan.rgb,vec3(0.2126,0.7152,0.0722));
        float ridge=pow(0.5+0.5*sin(p.y*117.0+p.x*38.0-t*1.7),10.0);
        col+=(1.0-col)*(vec3(0.16,0.12,0.04)+spectral*0.38)*armor*smoothstep(0.15,0.52,luma)*(0.3+0.7*ridge);
    }
    gl_FragColor=vec4(mix(scan.rgb,clamp(col,0.0,1.0),art),scan.a);
}
